// F-27 Crescimento da semana e F-28 Conteúdo extra da Redatora.
// Componente próprio da aba Comunidade (o pacote da Comunidade posiciona os outros cards).
// Nada aqui publica: a Lana copia o texto e decide onde e quando usar.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { dataLocal, somarDias, horaLocal, dataCurta } from '@core/formato.ts';
import {
  JANELA_ACHADOS_DIAS,
  JANELA_RESPOSTAS_DIAS,
  ORIGEM_CONVITE,
  linkEntrada,
  podePedirOutraVersao,
  taticasDaSemana,
  temasRepetidos,
  type DataPico,
  type DuvidaRegistrada,
  type EstadoExtra,
  type TipoExtra,
} from '@core/crescimento/regras.ts';
import { Icone } from '@/components/Icone';
import { Vazio } from '@/components/Vazio';
import { useToast } from '@/components/Toast';
import { useConfig } from '@/lib/config';
import { lista, ok, useAcao, useConsulta } from '@/lib/dados';

interface Conteudo {
  id: string;
  tipo: TipoExtra;
  referencia: string;
  estado: EstadoExtra;
  versao: number;
  titulo: string | null;
  texto: string | null;
  alertas: { trecho: string; motivo: string }[];
  simulado: boolean;
  erro: string | null;
  oferta_id: string | null;
  copiado_em: string | null;
  atualizado_em: string;
}

interface OfertaAprovada {
  id: string;
  data: string;
  produtos: { nome: string } | null;
}

const K_CONTEUDOS = ['conteudos_extra'];

function useDados() {
  const hoje = dataLocal();
  const datas = useConsulta<DataPico[]>(['datas_pico'], async (sb) => lista(await sb.from('datas_pico').select('id, data, nome').gte('data', hoje).order('data')), []);
  const conteudos = useConsulta<Conteudo[]>(
    K_CONTEUDOS,
    async (sb) =>
      lista(
        await sb
          .from('conteudos_extra')
          .select('id, tipo, referencia, estado, versao, titulo, texto, alertas, simulado, erro, oferta_id, copiado_em, atualizado_em')
          .neq('estado', 'descartado')
          .order('criado_em', { ascending: false })
          .limit(40),
      ),
    [],
    // Enquanto a Redatora escreve, a tela confere a cada 20 segundos.
    { refetchInterval: 20_000 },
  );
  const ofertas = useConsulta<OfertaAprovada[]>(
    ['ofertas_aprovadas_recentes'],
    async (sb) =>
      lista(
        await sb
          .from('ofertas')
          .select('id, data, produtos(nome)')
          .eq('estado', 'aprovada')
          .gte('data', somarDias(hoje, -JANELA_ACHADOS_DIAS))
          .order('data', { ascending: false })
          .limit(8),
      ) as unknown as OfertaAprovada[],
    [],
  );
  const duvidas = useConsulta<DuvidaRegistrada[]>(
    ['duvidas_semana'],
    async (sb) =>
      lista(
        await sb
          .from('duvidas_registradas')
          .select('tema, contato_ref, pergunta, criado_em')
          .gte('criado_em', new Date(Date.now() - JANELA_RESPOSTAS_DIAS * 86_400_000).toISOString())
          .limit(1000),
      ),
    [],
  );
  return { hoje, datas, conteudos, ofertas, duvidas };
}

type Pedido = { tipo: 'lista_data'; data_pico_id: string } | { tipo: 'roteiro_video'; oferta_id: string } | { tipo: 'respostas_semana' } | { tipo: 'outra_versao'; conteudo_id: string };

function usePedir() {
  return useAcao<Pedido, { conteudo_id: string; criado: boolean }>(async (sb, corpo) => {
    const { data, error } = await sb.functions.invoke('conteudo-extra-pedir', { body: corpo });
    if (error) {
      // A função devolve { erro } em português; tenta mostrar essa frase.
      const ctx = (error as { context?: Response }).context;
      const msg = ctx ? ((await ctx.json().catch(() => null)) as { erro?: string } | null)?.erro : null;
      throw new Error(msg ?? 'Não deu para pedir agora.');
    }
    return data as { conteudo_id: string; criado: boolean };
  }, [K_CONTEUDOS]);
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

function Selo({ estado }: { estado: EstadoExtra | 'preparar' }) {
  if (estado === 'em_preparo') return <span className="pill pill-sun">Em preparo</span>;
  if (estado === 'pronto') return <span className="pill pill-ok">Pronto</span>;
  if (estado === 'erro') return <span className="pill pill-warn">Não deu certo</span>;
  return null;
}

const NOME_TIPO: Record<TipoExtra, string> = {
  roteiro_video: 'Roteiro de vídeo',
  lista_data: 'Lista de achados',
  respostas_semana: 'Respostas da semana',
};

function CartaoConteudo({ c }: { c: Conteudo }) {
  const toast = useToast();
  const pedir = usePedir();
  const marcar = useAcao<{ id: string; patch: Partial<Conteudo> }>(async (sb, { id, patch }) => {
    ok(await sb.from('conteudos_extra').update(patch).eq('id', id));
  }, [K_CONTEUDOS]);
  const podeRefazer = podePedirOutraVersao(c.estado, c.atualizado_em, new Date());

  return (
    <li>
      <div>
        <div className="t">
          {c.titulo ?? NOME_TIPO[c.tipo]} <Selo estado={c.estado} />
          {c.simulado ? <span className="pill pill-std">Simulado</span> : null}
        </div>
        <div className="n">
          {NOME_TIPO[c.tipo]}, versão {c.versao}
          {c.estado === 'em_preparo' ? `. A Redatora está escrevendo (pedido às ${horaLocal(new Date(c.atualizado_em))}).` : ''}
          {c.estado === 'erro' && c.erro ? `. ${c.erro}` : ''}
        </div>
        {c.estado === 'pronto' && c.texto ? (
          <>
            <div className="bubble" style={{ marginTop: 8 }}>
              <pre>{c.texto}</pre>
            </div>
            {c.alertas.length ? (
              <ul className="reasons" style={{ marginTop: 8 }}>
                {c.alertas.map((a, i) => (
                  <li key={i} className="warn">
                    Revise "{a.trecho}": {a.motivo}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
      <div className="post-actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        {c.estado === 'pronto' && c.texto ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={async () => {
              const deu = await copiar(c.texto!);
              toast(deu ? 'Texto copiado.' : 'Não deu para copiar. Selecione o texto e copie à mão.');
              if (deu && !c.copiado_em) marcar.mutate({ id: c.id, patch: { copiado_em: new Date().toISOString() } });
            }}
          >
            <Icone nome="copy" />
            {c.copiado_em ? 'Copiar de novo' : 'Copiar texto'}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!podeRefazer || pedir.isPending}
          onClick={() =>
            pedir.mutate(
              { tipo: 'outra_versao', conteudo_id: c.id },
              { onSuccess: () => toast('Pedido enviado. A nova versão volta aqui.'), onError: (e) => toast(e.message) },
            )
          }
        >
          <Icone nome="loop" />
          Pedir outra versão
        </button>
        {c.estado !== 'em_preparo' ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => marcar.mutate({ id: c.id, patch: { estado: 'descartado' } }, { onSuccess: () => toast('Descartado.') })}
          >
            Descartar
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function CrescimentoDaSemana() {
  const toast = useToast();
  const { hoje, datas, conteudos } = useDados();
  const config = useConfig();
  const pedir = usePedir();
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const taticas = useMemo(
    () =>
      taticasDaSemana({
        hoje,
        linkConvite: linkEntrada(base, ORIGEM_CONVITE),
        artesStatusPorDia: config.data?.artesStatusPorDia ?? 3,
        datasPico: datas.data ?? [],
        conteudos: conteudos.data ?? [],
      }),
    [hoje, base, config.data, datas.data, conteudos.data],
  );

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Crescimento da semana</h2>
          <p>Táticas do plano, já preparadas</p>
        </div>
      </div>
      <ul className="grow">
        {taticas.map((t) => {
          if (t.id === 'convite') {
            return (
              <li key={t.id}>
                <div>
                  <div className="t">{t.titulo}</div>
                  <div className="n">{t.nota}</div>
                  <div className="invite">{t.texto}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={async () => toast((await copiar(t.texto)) ? 'Convite copiado. Mande só para quem você conhece.' : 'Não deu para copiar.')}
                >
                  <Icone nome="copy" />
                  Copiar
                </button>
              </li>
            );
          }
          if (t.id === 'radar' || t.id === 'status') {
            return (
              <li key={t.id}>
                <div>
                  <div className="t">{t.titulo}</div>
                  <div className="n">{t.nota}</div>
                </div>
                <Link className="btn btn-ghost btn-sm" to={t.leva}>
                  {t.id === 'radar' ? 'Abrir Radar' : 'Abrir'}
                </Link>
              </li>
            );
          }
          return (
            <li key={t.id}>
              <div>
                <div className="t">{t.titulo}</div>
                <div className="n">{t.nota}</div>
              </div>
              {t.estado === 'preparar' ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={pedir.isPending}
                  onClick={() =>
                    pedir.mutate(
                      { tipo: 'lista_data', data_pico_id: t.dataPicoId },
                      { onSuccess: () => toast('Pedido enviado. A Redatora prepara a lista.'), onError: (e) => toast(e.message) },
                    )
                  }
                >
                  Preparar lista
                </button>
              ) : (
                <Selo estado={t.estado} />
              )}
            </li>
          );
        })}
      </ul>
      {(datas.data ?? []).length === 0 ? (
        <p className="small muted" style={{ marginTop: 12 }}>
          Nenhuma data de pico cadastrada à frente. As listas de achados aparecem aqui 30 dias antes de cada data.
        </p>
      ) : null}
    </div>
  );
}

export function ConteudoExtra() {
  const toast = useToast();
  const { conteudos, ofertas, duvidas } = useDados();
  const pedir = usePedir();
  const temas = useMemo(() => temasRepetidos(duvidas.data ?? [], new Date()), [duvidas.data]);
  const itens = conteudos.data ?? [];
  const comRoteiro = new Set(itens.filter((c) => c.tipo === 'roteiro_video').map((c) => c.oferta_id));
  const semRoteiro = (ofertas.data ?? []).filter((o) => !comRoteiro.has(o.id));

  const pedirComAviso = (p: Pedido, msg: string) => pedir.mutate(p, { onSuccess: () => toast(msg), onError: (e) => toast(e.message) });

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Conteúdo extra da Redatora</h2>
          <p>Roteiros de vídeo, listas de datas e respostas da semana. Você revisa, copia e decide.</p>
        </div>
      </div>

      <h3 className="qh">Roteiro de vídeo curto</h3>
      <p className="small muted" style={{ marginBottom: 8 }}>
        30 segundos, pode ser só mãos e produto. Escolha uma oferta aprovada.
      </p>
      {ofertas.isLoading ? (
        <p className="small muted">Carregando ofertas...</p>
      ) : semRoteiro.length === 0 ? (
        <Vazio titulo="Nenhuma oferta aprovada sem roteiro">Aprove ofertas na aba Ofertas para pedir um roteiro de vídeo.</Vazio>
      ) : (
        <ul className="grow" style={{ marginBottom: 16 }}>
          {semRoteiro.map((o) => (
            <li key={o.id}>
              <div>
                <div className="t">{o.produtos?.nome ?? 'Oferta aprovada'}</div>
                <div className="n">Aprovada em {dataCurta(o.data)}</div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pedir.isPending}
                onClick={() => pedirComAviso({ tipo: 'roteiro_video', oferta_id: o.id }, 'Pedido enviado. O roteiro volta aqui.')}
              >
                <Icone nome="pen" />
                Pedir roteiro
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="qh" style={{ marginTop: 16 }}>
        Respostas da semana
      </h3>
      <p className="small muted" style={{ marginBottom: 8 }}>
        Quando 3 pessoas fazem a mesma pergunta na semana, vira um post de respostas no canal.
      </p>
      {temas.length === 0 ? (
        <Vazio titulo="Nenhuma dúvida se repetiu nesta semana">Aguardando dados da caixa de mensagens.</Vazio>
      ) : (
        <ul className="grow" style={{ marginBottom: 16 }}>
          <li>
            <div>
              <div className="t">{temas.length === 1 ? '1 dúvida repetida' : `${temas.length} dúvidas repetidas`}</div>
              <div className="n">{temas.map((t) => `${t.tema} (${t.pessoas} pessoas)`).join('; ')}</div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pedir.isPending}
              onClick={() => pedirComAviso({ tipo: 'respostas_semana' }, 'Pedido enviado. O post de respostas volta aqui.')}
            >
              Preparar post
            </button>
          </li>
        </ul>
      )}

      <h3 className="qh" style={{ marginTop: 16 }}>
        Preparados pela Redatora
      </h3>
      {conteudos.isLoading ? (
        <p className="small muted">Carregando...</p>
      ) : itens.length === 0 ? (
        <Vazio titulo="Nada preparado ainda">Peça um roteiro, uma lista de data ou o post de respostas acima.</Vazio>
      ) : (
        <ul className="grow">
          {itens.map((c) => (
            <CartaoConteudo key={c.id} c={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Seção de crescimento da aba Comunidade: os dois cards empilhados. */
export default function Crescimento() {
  return (
    <div className="stack">
      <CrescimentoDaSemana />
      <ConteudoExtra />
    </div>
  );
}
