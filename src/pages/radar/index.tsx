// F-21 Radar de Comunidades (seção 5.11): lugares para divulgar o link de entrada, sempre com permissão.
import { useMemo, useState, type FormEvent } from 'react';
import { CabecalhoTela, Vazio } from '@/components/Vazio';
import { Icone } from '@/components/Icone';
import { useToast } from '@/components/Toast';
import { dataCurta, dataLocal } from '@core/formato.ts';
import { acoesPermitidas, grupoDoEstado, ROTULO_ESTADO, totais, type EstadoLugar, type GrupoFiltro } from '@core/radar/lugares.ts';
import { diasPorExtenso, NOMES_DIAS, proximaVezPermitida } from '@core/radar/agenda.ts';
import { completarSeguidores, linkEntrada, montarConvite, ORIGEM_DIRETO } from '@core/radar/entrada.ts';
import { modoLocal, useAcaoRadar, useRadar, type AcaoRadar, type Lugar } from './dados';

const PILULA: Record<EstadoLugar, string> = {
  novo: 'pill-plum',
  pedir_permissao: 'pill-sun',
  aguardando: 'pill-std',
  aprovado: 'pill-ok',
  recusou: 'pill-warn',
  descartado: 'pill-std',
};

const FILTROS: { id: 'todos' | GrupoFiltro; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'novo', rotulo: 'Novos' },
  { id: 'conversa', rotulo: 'Em conversa' },
  { id: 'aprovado', rotulo: 'Aprovados' },
];

const REGRAS = [
  'Fora dos seus canais vai só o link de entrada. Link de oferta, nunca.',
  'Sempre com permissão do administrador e no dia que a regra do lugar permite.',
  'Uma divulgação por lugar, no intervalo combinado com o administrador.',
  'Nada é automático: o Radar não entra em grupos, não posta, não adiciona pessoas e não coleta números.',
  'Lugar que recusou não volta para a lista. Lugar descartado também não.',
];

function baseSite(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

function useCopiar() {
  const toast = useToast();
  return (texto: string, ok = 'Copiado.') =>
    void copiar(texto).then((r) => toast(r ? ok : 'Não deu para copiar. Toque e segure o texto para copiar.'));
}

export default function Radar() {
  const { data, isLoading, isError } = useRadar();
  const [filtro, setFiltro] = useState<'todos' | GrupoFiltro>('todos');
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const lugares = useMemo(() => data?.lugares ?? [], [data]);
  const t = totais(lugares);
  const visiveis = lugares.filter((l) => filtro === 'todos' || grupoDoEstado(l.estado) === filtro);
  const sel = lugares.find((l) => l.id === selecionado) ?? visiveis[0] ?? null;
  const cliquesMes = data?.cliques ? Object.values(data.cliques).reduce((a, b) => a + b, 0) : null;

  return (
    <section className="view" aria-labelledby="h-radar">
      <CabecalhoTela
        eyebrow="Radar de Comunidades"
        titulo="Onde divulgar o seu link"
        lead="O Radar encontra lugares onde o seu público já está e prepara a abordagem. Fora dos seus canais vai só o convite para seguir, sempre com permissão. As ofertas ficam dentro da comunidade."
      />

      <div className="pipe">
        <Total k="Novos do Radar" v={t.novos} s="Para você avaliar" />
        <Total k="Em conversa" v={t.em_conversa} s="Pedir permissão ou aguardando" />
        <Total k="Aprovados" v={t.aprovados} s="Onde você pode divulgar" />
        <Total k="Cliques no mês" v={cliquesMes} s="Todos os links de entrada" />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Lugares encontrados</h2>
              <p>Busca semanal em grupos e canais públicos do nicho e da região</p>
            </div>
          </div>
          <div className="filters" role="group" aria-label="Filtrar lugares" style={{ marginBottom: 14 }}>
            {FILTROS.map((f) => (
              <button key={f.id} type="button" className="chip" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
                {f.rotulo}
              </button>
            ))}
          </div>
          {isLoading ? (
            <p className="carregando">Carregando...</p>
          ) : isError ? (
            <Vazio titulo="Não deu para carregar o Radar">Tente de novo em instantes.</Vazio>
          ) : visiveis.length ? (
            <div className="places">
              {visiveis.map((l) => (
                <CartaoLugar key={l.id} l={l} ultima={data?.ultimas[l.id] ?? null} cliques={data?.cliques?.[l.origem ?? ''] ?? null} onVerMensagens={() => setSelecionado(l.id)} selecionado={sel?.id === l.id} />
              ))}
            </div>
          ) : lugares.length ? (
            <Vazio titulo="Nada neste filtro">O Radar faz uma nova busca toda segunda-feira.</Vazio>
          ) : (
            <Vazio titulo="Sem lugares novos">
              {modoLocal ? 'Aguardando dados.' : 'O Radar faz a busca toda segunda às 7h. Os lugares encontrados aparecem aqui.'}
            </Vazio>
          )}
        </div>

        <div className="stack">
          <MensagensProntas l={sel} />
          <LinksPorOrigem lugares={lugares.filter((l) => l.estado === 'aprovado' && l.origem)} cliques={data?.cliques ?? null} />
          <div className="card">
            <div className="card-head">
              <h2>Regras do Radar</h2>
            </div>
            <ul className="rules">
              {REGRAS.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Total({ k, v, s }: { k: string; v: number | null; s: string }) {
  return (
    <div className="sum">
      <span className="k">{k}</span>
      <span className="v num">{v == null ? 'aguardando dados' : v}</span>
      <span className="s">{s}</span>
    </div>
  );
}

function CartaoLugar({
  l,
  ultima,
  cliques,
  onVerMensagens,
  selecionado,
}: {
  l: Lugar;
  ultima: string | null;
  cliques: number | null;
  onVerMensagens: () => void;
  selecionado: boolean;
}) {
  const acao = useAcaoRadar();
  const toast = useToast();
  const copy = useCopiar();
  const [aprovando, setAprovando] = useState(false);
  const permitidas = acoesPermitidas(l);
  const hoje = dataLocal();
  const proxima =
    l.estado === 'aprovado' && l.intervalo_dias
      ? proximaVezPermitida({ dias_permitidos: l.dias_permitidos, intervalo_dias: l.intervalo_dias, ultima_divulgacao: ultima ? dataLocal(new Date(ultima)) : null }, hoje)
      : null;
  const liberadoHoje = proxima === hoje;

  function fazer(corpo: AcaoRadar, ok: string) {
    acao.mutate(corpo, {
      onSuccess: () => toast(ok),
      onError: (e) => toast(e instanceof Error ? e.message : 'Não deu para salvar.'),
    });
  }

  const link = l.origem ? linkEntrada(baseSite(), l.origem) : null;
  const convite = link && l.mensagens.convite ? montarConvite(l.mensagens.convite, link) : null;

  return (
    <article className="place" data-status={l.estado} aria-current={selecionado ? 'true' : undefined}>
      <div className="place-top">
        <h3>{l.nome}</h3>
        <span className="pill pill-std">{l.tipo}</span>
        <span className={`pill ${PILULA[l.estado]}`}>{ROTULO_ESTADO[l.estado]}</span>
      </div>
      <div className="meta">
        {l.regiao ? <span>{l.regiao}</span> : null}
        <span>Membros {l.membros ?? 'não informado'}</span>
        <span>Nota do Radar {l.nota ?? 'sem nota'}/100</span>
        {l.url ? (
          <a href={l.url} target="_blank" rel="noopener noreferrer">
            Ver página pública
          </a>
        ) : null}
      </div>
      <p className="rule">
        <b>Regra do lugar:</b> {l.regra}
      </p>
      {l.proibe_links || l.aviso ? (
        <p className="rule warn">{l.aviso ?? 'A regra do lugar proíbe links. O Radar não recomenda.'}</p>
      ) : l.motivo ? (
        <p className="rule muted">Sugerido por: {l.motivo}</p>
      ) : null}
      {l.alertas?.map((a, i) => (
        <p key={i} className="rule warn">
          Alerta da Guardiã: "{a.trecho}". {a.texto}
        </p>
      ))}
      {l.estado === 'aprovado' ? (
        <p className="rule muted">
          Dias permitidos: {diasPorExtenso(l.dias_permitidos)}. Intervalo combinado: {l.intervalo_dias === 1 ? '1 dia' : `${l.intervalo_dias} dias`}.
          {cliques != null ? ` Cliques no mês: ${cliques}.` : ''}
        </p>
      ) : null}

      {aprovando ? (
        <FormAprovar
          ocupado={acao.isPending}
          onCancelar={() => setAprovando(false)}
          onSalvar={(dias, intervalo) =>
            acao.mutate(
              { lugar_id: l.id, acao: 'aprovou', dias_permitidos: dias, intervalo_dias: intervalo },
              {
                onSuccess: () => {
                  setAprovando(false);
                  toast('Aprovado. O convite já está pronto.');
                },
                onError: (e) => toast(e instanceof Error ? e.message : 'Não deu para salvar.'),
              },
            )
          }
        />
      ) : (
        <div className="acts">
          {l.estado === 'novo' && permitidas.includes('adicionar') ? (
            <button type="button" className="btn btn-primary btn-sm" disabled={acao.isPending} onClick={() => fazer({ lugar_id: l.id, acao: 'adicionar' }, 'Adicionado. O pedido ao administrador já está pronto.')}>
              Adicionar à lista
            </button>
          ) : null}
          {l.estado === 'pedir_permissao' ? (
            <>
              <button type="button" className="btn btn-primary btn-sm" disabled={!l.mensagens.pedido_admin} onClick={() => copy(l.mensagens.pedido_admin ?? '', 'Pedido copiado. Envie você mesma ao administrador.')}>
                <Icone nome="copy" />
                Copiar pedido ao admin
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={acao.isPending} onClick={() => fazer({ lugar_id: l.id, acao: 'ja_pedi' }, 'Anotado. Agora é aguardar a resposta.')}>
                Já pedi
              </button>
            </>
          ) : null}
          {l.estado === 'aguardando' ? (
            <>
              {l.pedido_em ? <span className="small muted">Pedido enviado em {dataCurta(dataLocal(new Date(l.pedido_em)))}</span> : null}
              <button type="button" className="btn btn-primary btn-sm" disabled={acao.isPending} onClick={() => setAprovando(true)}>
                Aprovou
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={acao.isPending} onClick={() => fazer({ lugar_id: l.id, acao: 'recusou' }, 'Anotado. Este lugar sai da lista.')}>
                Recusou
              </button>
            </>
          ) : null}
          {l.estado === 'aprovado' ? (
            <>
              <button type="button" className="btn btn-primary btn-sm" disabled={!convite} onClick={() => convite && copy(convite, 'Convite copiado com o link deste lugar.')}>
                <Icone nome="copy" />
                Copiar convite
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={acao.isPending || !liberadoHoje}
                title={liberadoHoje ? undefined : 'Hoje não é um dia permitido para este lugar'}
                onClick={() => fazer({ lugar_id: l.id, acao: 'divulguei' }, 'Registrado. A Audiência acompanha os cliques deste link.')}
              >
                Divulguei hoje
              </button>
              <span className="small muted">Próxima vez permitida: {proxima ? (proxima === hoje ? 'hoje' : dataCurta(proxima)) : 'sem data'}</span>
            </>
          ) : null}
          {l.estado !== 'novo' || !l.proibe_links ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onVerMensagens}>
              Ver mensagens
            </button>
          ) : null}
          {permitidas.includes('descartar') ? (
            <button type="button" className="btn btn-ghost btn-sm" disabled={acao.isPending} onClick={() => fazer({ lugar_id: l.id, acao: 'descartar' }, 'Descartado. O Radar não sugere de novo.')}>
              Descartar
            </button>
          ) : null}
        </div>
      )}
    </article>
  );
}

function FormAprovar({ ocupado, onSalvar, onCancelar }: { ocupado: boolean; onSalvar: (dias: number[], intervalo: number) => void; onCancelar: () => void }) {
  const [dias, setDias] = useState<number[]>([]);
  const [intervalo, setIntervalo] = useState('7');
  const [erro, setErro] = useState<string | null>(null);
  function enviar(e: FormEvent) {
    e.preventDefault();
    const iv = Number(intervalo);
    if (!dias.length) return setErro('Marque ao menos um dia permitido.');
    if (!Number.isInteger(iv) || iv < 1 || iv > 365) return setErro('Informe o intervalo combinado em dias.');
    setErro(null);
    onSalvar(dias, iv);
  }
  return (
    <form className="aprovar" onSubmit={enviar}>
      <span className="small muted" id="dias-rotulo">
        <b>Dias permitidos pelo administrador</b>
      </span>
      <div className="dias filters" role="group" aria-labelledby="dias-rotulo">
        {NOMES_DIAS.map((n, d) => (
          <button key={n} type="button" className="chip" aria-pressed={dias.includes(d)} onClick={() => setDias((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))}>
            {n}
          </button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="intervalo">Intervalo combinado (dias entre divulgações)</label>
        <input id="intervalo" type="number" min={1} max={365} inputMode="numeric" value={intervalo} onChange={(e) => setIntervalo(e.target.value)} />
      </div>
      {erro ? (
        <p className="aviso erro" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="acts">
        <button type="submit" className="btn btn-primary btn-sm" disabled={ocupado}>
          Salvar aprovação
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function MensagensProntas({ l }: { l: Lugar | null }) {
  const copy = useCopiar();
  const link = l?.origem ? linkEntrada(baseSite(), l.origem) : null;
  const itens = l
    ? [
        { titulo: 'Pedido de permissão ao administrador', texto: l.mensagens.pedido_admin ?? null },
        { titulo: 'Proposta de troca de divulgação', texto: l.mensagens.troca ? completarSeguidores(l.mensagens.troca, null) : null },
        {
          titulo: 'Convite para postar',
          texto: l.mensagens.convite ? (link ? montarConvite(l.mensagens.convite, link) : montarConvite(l.mensagens.convite, '[o link aparece quando o lugar for aprovado]')) : null,
          bloqueado: !link,
        },
      ].filter((x) => x.texto)
    : [];
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Mensagens prontas</h2>
          <p>{l ? `A Redatora ajustou para "${l.nome}"` : 'A Redatora ajusta para cada lugar'}</p>
        </div>
      </div>
      {!l || l.proibe_links ? (
        <Vazio titulo="Nenhum lugar escolhido">Toque em "Ver mensagens" num lugar para ver o pedido, a troca e o convite.</Vazio>
      ) : (
        <div className="msgs">
          {itens.map((m) => (
            <div key={m.titulo}>
              <h3>{m.titulo}</h3>
              <div className="msg">{m.texto}</div>
              <button type="button" className="btn btn-ghost btn-sm" disabled={'bloqueado' in m && m.bloqueado} onClick={() => copy(m.texto ?? '')}>
                <Icone nome="copy" />
                Copiar
              </button>
            </div>
          ))}
          {l.mensagens.troca?.includes('{seguidores}') ? <p className="small muted">Complete o número de seguidores antes de enviar a proposta de troca.</p> : null}
        </div>
      )}
    </div>
  );
}

function LinksPorOrigem({ lugares, cliques }: { lugares: Lugar[]; cliques: Record<string, number> | null }) {
  const copy = useCopiar();
  const geral = linkEntrada(baseSite(), ORIGEM_DIRETO);
  const valor = (o: string) => (cliques ? String(cliques[o] ?? 0) : 'aguardando dados');
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Links de entrada por origem</h2>
          <p>Cada lugar ganha um link. A página de entrada conta o clique e oferece WhatsApp ou Telegram.</p>
        </div>
      </div>
      <ul className="links">
        {lugares.map((l) => {
          const link = linkEntrada(baseSite(), l.origem!);
          return (
            <li key={l.id}>
              <div>
                <b className="small">{l.nome}</b>
                <br />
                <code>{link}</code>
              </div>
              <div className="r">
                <span>Cliques {valor(l.origem!)}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(link, 'Link copiado.')}>
                  Copiar
                </button>
              </div>
            </li>
          );
        })}
        <li>
          <div>
            <b className="small">Link geral (sem origem)</b>
            <br />
            <code>{geral}</code>
          </div>
          <div className="r">
            <span>Cliques {valor(ORIGEM_DIRETO)}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(geral, 'Link copiado.')}>
              Copiar
            </button>
          </div>
        </li>
      </ul>
      {!lugares.length ? <p className="small muted" style={{ marginTop: 10 }}>Os lugares aprovados aparecem aqui com o link próprio.</p> : null}
    </div>
  );
}
