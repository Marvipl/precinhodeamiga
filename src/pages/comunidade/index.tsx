// Comunidade (F-25, F-26, seção 5.13): caixa de mensagens da Atendente, pedidos das amigas e regras.
// A seção de crescimento (F-27, F-28) é de outro pacote: entra por src/pages/comunidade/Crescimento.tsx quando existir.
import { useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { CabecalhoTela, Vazio } from '@/components/Vazio';
import { Icone } from '@/components/Icone';
import { useToast } from '@/components/Toast';
import { useEDono } from '@/lib/auth';
import { useConfig, useSalvarConfig } from '@/lib/config';
import { modoLocal } from '@/lib/supabase';
import {
  quemEscreveu,
  useAcaoCaixa,
  useAtualizarCategoria,
  useCaixa,
  useCategorias,
  usePedidos,
  useRespondidasHoje,
  type AcaoCaixa,
  type CategoriaAtendente,
  type MensagemCaixa,
  type PedidoAmiga,
} from '@/lib/atendente';
import { ROTULO_CATEGORIA, TEXTOS_NIVEL1, eCategoriaFechada, eCategoriaNivel1 } from '@core/atendente/niveis.ts';
import { avisoRecebimento, blocosValidos, horaCurta, rotuloProximoBloco } from '@core/atendente/regras.ts';
import { dataCurta, dataLocal } from '@core/formato.ts';

// Componente opcional do pacote de crescimento; sem ele, a seção não aparece.
const extras = import.meta.glob<{ default: ComponentType }>('./Crescimento.tsx', { eager: true });
const Crescimento = Object.values(extras)[0]?.default;

export default function Pagina() {
  const { data: config } = useConfig();
  const blocos = blocosValidos(config?.blocosRevisao);
  return (
    <section className="view">
      <CabecalhoTela
        eyebrow="Pedidos e crescimento"
        titulo="Comunidade"
        lead="Canais não têm conversa aberta. As mensagens chegam pelo bot do Telegram ou pelo formulário fixado nos canais. A Atendente responde o simples na hora e junta o resto para você revisar em blocos."
      />
      <div className="grid-2">
        <div className="stack">
          <Caixa blocos={blocos} />
          <Pedidos />
        </div>
        <div className="stack">
          <Regras blocos={blocos} />
          {Crescimento ? <Crescimento /> : null}
          <div className="card">
            <div className="card-head">
              <div>
                <h2>Audiência em resumo</h2>
                <p>Seguidores somados dos dois canais</p>
              </div>
              <Link className="btn btn-ghost btn-sm" to="/audiencia">
                Ver audiência
                <Icone nome="arrow" />
              </Link>
            </div>
            <p className="small muted">Os números aparecem na aba Audiência quando houver registros.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Caixa de mensagens
// ---------------------------------------------------------------------------
const NIVEIS = [
  { n: 1, t: 'Responde sozinha', d: 'Cupom, link que não abre, como funciona o canal, se a oferta ainda vale e problema com entrega, que ela orienta a abrir na Shopee', p: 'pill-ok', q: 'Na hora' },
  { n: 2, t: 'Responde com dado do anúncio', d: 'Medidas, cores e prazo, só quando a informação está escrita no anúncio', p: 'pill-ok', q: 'Em até 30 min' },
  { n: 3, t: 'Junta para você aprovar', d: 'Pedidos de produto com opções da Caçadora e dúvidas que o anúncio não responde', p: 'pill-sun', q: 'Nos blocos' },
  { n: 4, t: 'Chama você na hora', d: 'Reclamação séria, proposta de parceria, ofensa ou assunto fora do tema', p: 'pill-warn', q: 'Notificação' },
];

function Caixa({ blocos }: { blocos: string[] }) {
  const { data: msgs = [], isLoading, isError } = useCaixa();
  const { data: auto = 0 } = useRespondidasHoje();
  const urgentes = msgs.filter((m) => m.estado === 'urgente');
  const rascunhos = msgs.filter((m) => m.estado === 'rascunho');
  const naFila = msgs.filter((m) => m.estado === 'pendente' || m.estado === 'processando').length;
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Caixa de mensagens</h2>
          <p>Próximo bloco de revisão: {rotuloProximoBloco(new Date(), blocos)}</p>
        </div>
        <span className="pill pill-ok">Atendente ativa</span>
      </div>
      <div className="inbox-stats">
        <div>
          <span className="k">Respondidas sozinhas hoje</span>
          {modoLocal ? <span className="small muted">aguardando dados</span> : <span className="v num">{auto}</span>}
        </div>
        <div>
          <span className="k">Esperando você</span>
          <span className="v num">{rascunhos.length}</span>
        </div>
        <div>
          <span className="k">Urgentes</span>
          <span className="v num">{urgentes.length}</span>
        </div>
      </div>
      <ul className="levels">
        {NIVEIS.map((l) => (
          <li key={l.n}>
            <span className="lvn">{l.n}</span>
            <div>
              <b>{l.t}</b>
              <span className="d">{l.d}</span>
            </div>
            <span className={`pill ${l.p}`}>{l.q}</span>
          </li>
        ))}
      </ul>

      {isError ? <p className="aviso erro" role="alert">Não foi possível carregar as mensagens.</p> : null}

      {urgentes.length ? (
        <>
          <h3 className="qh">Urgentes</h3>
          <div className="queue">
            {urgentes.map((m) => (
              <ItemCaixa key={m.id} m={m} />
            ))}
          </div>
        </>
      ) : null}

      <h3 className="qh" style={{ marginTop: urgentes.length ? 18 : 0 }}>
        Esperando você
      </h3>
      {isLoading ? (
        <p className="small muted">Carregando...</p>
      ) : rascunhos.length ? (
        <div className="queue">
          {rascunhos.map((m) => (
            <ItemCaixa key={m.id} m={m} />
          ))}
        </div>
      ) : (
        <Vazio titulo="Caixa vazia">
          {modoLocal ? 'Aguardando dados: o painel está em modo local.' : 'Nenhuma mensagem esperando você agora.'}
        </Vazio>
      )}
      {naFila ? (
        <p className="small muted" style={{ marginTop: 12 }}>
          {naFila} {naFila === 1 ? 'mensagem espera' : 'mensagens esperam'} o próximo ciclo da Atendente (a cada 30 minutos, das 8h às 22h30).
        </p>
      ) : null}
    </div>
  );
}

function rotuloOrigem(m: MensagemCaixa): string {
  if (m.origem === 'telegram') return 'pelo bot do Telegram';
  if (m.contatos?.preferencia === 'whatsapp') return 'pelo formulário, quer resposta no WhatsApp';
  return 'pelo formulário, resposta pelo canal';
}

function ItemCaixa({ m }: { m: MensagemCaixa }) {
  const eDono = useEDono();
  const toast = useToast();
  const acao = useAcaoCaixa();
  const urgente = m.estado === 'urgente';
  const [editando, setEditando] = useState(urgente);
  const [texto, setTexto] = useState(m.rascunho ?? '');
  const bloqueado = m.alertas?.some((a) => a.tipo === 'dado_sensivel' || a.tipo === 'finge_lana');

  async function fazer(a: AcaoCaixa, sucesso: string) {
    try {
      const r = await acao.mutateAsync(a);
      if (r.whatsapp_link) {
        window.open(r.whatsapp_link, '_blank', 'noopener');
        toast('Abrimos o seu WhatsApp com o texto pronto. Toque em enviar.');
      } else {
        toast(r.virou_automatica ? `${sucesso} Esta resposta passa a sair sozinha.` : sucesso);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não deu certo. Tente de novo.');
    }
  }

  const enviadoPor = m.origem === 'telegram' ? 'Enviada pelo bot.' : m.contatos?.preferencia === 'whatsapp' ? 'Abra o WhatsApp para enviar.' : 'Registrada; a resposta vai pelo canal como achado a pedido.';

  return (
    <div className="qitem">
      <p className="q">
        <b>{quemEscreveu(m.contatos)}</b> {rotuloOrigem(m)}: {m.texto ?? 'texto apagado pelo prazo de guarda'}
      </p>
      {urgente ? (
        <p className="aviso erro">Nível 4: {m.motivo ?? 'assunto para você'}</p>
      ) : (
        <div className="a">
          <small>
            Rascunho da Atendente
            {m.categoria && eCategoriaFechada(m.categoria) ? ` · ${ROTULO_CATEGORIA[m.categoria]}` : ''}
            {m.motivo ? ` · ${m.motivo}` : ''}
          </small>
          {editando ? null : m.rascunho || 'A Atendente ainda não escreveu o rascunho.'}
        </div>
      )}
      {m.alertas?.length ? (
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {m.alertas.map((a, i) => (
            <li key={i} className="muted">
              Alerta ({a.tipo.replace('_', ' ')}): "{a.trecho}"
            </li>
          ))}
        </ul>
      ) : null}
      {m.erro_envio ? <p className="aviso erro">Último envio falhou: {m.erro_envio}</p> : null}
      {eDono ? (
        <p className="small muted">Só a Lana responde as mensagens.</p>
      ) : (
        <>
          {editando ? (
            <div className="field">
              <label htmlFor={`r-${m.id}`}>{urgente ? 'Sua resposta' : 'Resposta editada'}</label>
              <textarea id={`r-${m.id}`} className="input" rows={4} maxLength={1500} value={texto} onChange={(e) => setTexto(e.target.value)} />
              <span className="small muted">Para pôr um link de produto, escreva {'{link:'}id do produto{'}'}: o link com comissão e o aviso entram sozinhos.</span>
            </div>
          ) : null}
          <div className="post-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={acao.isPending || (editando ? !texto.trim() : !m.rascunho || bloqueado)}
              onClick={() => void fazer({ acao: 'aprovar', mensagem_id: m.id, ...(editando ? { texto } : {}) }, `Resposta aprovada. ${enviadoPor}`)}
            >
              {editando ? 'Enviar' : 'Aprovar e enviar'}
            </button>
            {!urgente ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditando((v) => !v)}>
                {editando ? 'Cancelar edição' : 'Editar'}
              </button>
            ) : null}
            {!urgente ? (
              <button type="button" className="btn btn-ghost btn-sm" disabled={acao.isPending} onClick={() => void fazer({ acao: 'outra_versao', mensagem_id: m.id }, 'Pedido enviado. A nova versão chega no próximo ciclo.')}>
                Pedir outra versão
              </button>
            ) : null}
            {urgente ? (
              <button type="button" className="btn btn-ghost btn-sm" disabled={acao.isPending} onClick={() => void fazer({ acao: 'respondi_por_fora', mensagem_id: m.id }, 'Marcada como respondida.')}>
                Já respondi por fora
              </button>
            ) : null}
            <button type="button" className="btn btn-ghost btn-sm" disabled={acao.isPending} onClick={() => void fazer({ acao: 'descartar', mensagem_id: m.id }, 'Mensagem arquivada sem resposta.')}>
              Arquivar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pedidos das amigas
// ---------------------------------------------------------------------------
function estadoPedido(p: PedidoAmiga): { texto: string; classe: string } {
  if (p.estado === 'respondido') {
    const d = dataLocal(new Date(p.atualizado_em));
    return { texto: d === dataLocal() ? 'Respondido hoje' : `Respondido em ${dataCurta(d)}`, classe: 'pill-std' };
  }
  if (p.estado === 'opcoes_encontradas') return { texto: 'Opções encontradas', classe: 'pill-ok' };
  return { texto: 'Caçadora procurando', classe: 'pill-sun' };
}

function Pedidos() {
  const { data: pedidos = [], isLoading } = usePedidos();
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Pedidos das amigas</h2>
          <p>Chegam pelo formulário dos canais, pelo bot ou por você, na aba Ofertas</p>
        </div>
      </div>
      {isLoading ? (
        <p className="small muted">Carregando...</p>
      ) : pedidos.length ? (
        <ul className="reqs">
          {pedidos.map((p) => {
            const e = estadoPedido(p);
            const quem = p.origem === 'lana' ? 'Você' : quemEscreveu(p.contatos);
            return (
              <li key={p.id}>
                <span className="txt">
                  <b>{quem}</b> pediu {p.texto}
                  {p.preco_max != null ? ` até R$ ${Number(p.preco_max).toLocaleString('pt-BR')}` : ''}
                </span>
                {p.achado_a_pedido ? <span className="pill pill-plum">Vira achado a pedido</span> : null}
                <span className={`pill ${e.classe}`}>{e.texto}</span>
                {p.estado === 'opcoes_encontradas' && p.origem === 'lana' ? (
                  <Link className="btn btn-ghost btn-sm" to="/ofertas">
                    Revisar
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <Vazio titulo="Nenhum pedido ainda">Quando alguém pedir um produto pelo formulário ou pelo bot, ele aparece aqui.</Vazio>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Regras da Atendente
// ---------------------------------------------------------------------------
function Regras({ blocos }: { blocos: string[] }) {
  const eDono = useEDono();
  const toast = useToast();
  const salvar = useSalvarConfig();
  const soNoite = blocos.length === 1;
  const ultimo = blocos[blocos.length - 1];
  const site = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) || window.location.origin;
  const linkFale = `${site.replace(/\/$/, '')}/fale`;

  async function escolher(novos: string[]) {
    try {
      await salvar.mutateAsync({ nome: 'blocosRevisao', valor: novos });
      toast('Blocos de revisão salvos.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não deu certo.');
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Regras da Atendente</h2>
          <p>Para você não precisar ficar no celular</p>
        </div>
      </div>
      <div className="field">
        <span className="small muted" id="blkLabel">
          <b>Blocos de revisão</b>
        </span>
        <div className="seg" role="group" aria-labelledby="blkLabel">
          <button type="button" aria-pressed={!soNoite} disabled={eDono || salvar.isPending} onClick={() => void escolher(['12:00', '21:00'])}>
            12h e 21h
          </button>
          <button type="button" aria-pressed={soNoite} disabled={eDono || salvar.isPending} onClick={() => void escolher(['21:00'])}>
            Só às 21h
          </button>
        </div>
      </div>
      <ul className="rules" style={{ marginTop: 14 }}>
        <li>
          <b>Aviso na hora:</b> "{avisoRecebimento(new Date(`${dataLocal()}T15:00:00-03:00`), [ultimo])}"
        </li>
        <li>
          <b>Vira automática:</b> resposta que você aprova 3 vezes sem editar passa a sair sozinha. Dá para desligar.
        </li>
        <li>
          <b>Uma resposta para todas:</b> 3 pessoas com a mesma dúvida na semana viram um post de respostas no canal. 2 pedidos do mesmo produto viram um achado a pedido.
        </li>
        <li>
          <b>Silêncio:</b> fora dos blocos ({blocos.map(horaCurta).join(' e ')}), o celular só toca no nível 4.
        </li>
        <li>
          <b>Limites:</b> nunca pede CPF, endereço ou dados de pagamento, nunca promete preço ou estoque além do anúncio e sempre oferece falar com a Lana.
        </li>
        <li>
          <b>Formulário:</b> quem pede resposta pelo WhatsApp recebe pelo seu WhatsApp: o painel abre a conversa com o texto pronto e você toca em enviar.
        </li>
      </ul>
      <RespostasAutomaticas />
      <div className="field" style={{ marginTop: 14 }}>
        <span className="small muted">
          <b>Link do formulário "Fale com a Precinho"</b> (fixe na descrição dos dois canais)
        </span>
        <div className="post-actions">
          <code className="small" style={{ wordBreak: 'break-all' }}>
            {linkFale}
          </code>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void navigator.clipboard?.writeText(linkFale).then(() => toast('Link copiado.'), () => toast('Não deu para copiar.'))}
          >
            <Icone nome="copy" />
            Copiar
          </button>
        </div>
      </div>
    </div>
  );
}

function RespostasAutomaticas() {
  const eDono = useEDono();
  const toast = useToast();
  const { data: cats = [] } = useCategorias();
  const atualizar = useAtualizarCategoria();
  if (!cats.length) return null;

  async function mudar(c: CategoriaAtendente, patch: Parameters<typeof atualizar.mutateAsync>[0]['patch'], msg: string) {
    try {
      await atualizar.mutateAsync({ categoria: c.categoria, patch });
      toast(msg);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não deu certo.');
    }
  }

  return (
    <>
      <h3 className="qh" style={{ marginTop: 18 }}>
        Respostas automáticas
      </h3>
      <ul className="reqs">
        {cats.map((c) => {
          const rotulo = eCategoriaFechada(c.categoria) ? ROTULO_CATEGORIA[c.categoria] : c.categoria;
          const ligada = c.automatica && !c.desligada;
          const sugerido = eCategoriaNivel1(c.categoria) ? TEXTOS_NIVEL1[c.categoria] : null;
          return (
            <li key={c.categoria}>
              <span className="txt">
                <b>{rotulo}</b>
                <span className="small muted" style={{ display: 'block' }}>
                  {c.nivel === 1 ? c.modelo ?? sugerido : 'Nível 2: só sai sozinha quando o dado está escrito no anúncio.'}
                </span>
              </span>
              <span className={`pill ${ligada ? 'pill-ok' : 'pill-std'}`}>
                {ligada ? 'Sai sozinha' : c.automatica ? 'Desligada' : `${c.aprovacoes_seguidas} de 3 aprovações`}
              </span>
              {eDono ? null : !c.automatica ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={atualizar.isPending}
                  onClick={() =>
                    void mudar(c, { automatica: true, desligada: false, ...(c.nivel === 1 && !c.modelo && sugerido ? { modelo: sugerido } : {}) }, 'Texto aprovado: passa a sair sozinho.')
                  }
                >
                  {c.nivel === 1 ? 'Aprovar texto' : 'Ligar'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={atualizar.isPending}
                  onClick={() => void mudar(c, { desligada: !c.desligada }, c.desligada ? 'Resposta automática ligada.' : 'Resposta automática desligada.')}
                >
                  {c.desligada ? 'Ligar' : 'Desligar'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
