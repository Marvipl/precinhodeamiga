// F-12 Como funciona: princípios, os dois caminhos, os oito agentes, ordem de construção e o estado das rotinas.
// Textos do mock, corrigidos pela tabela de divergências do documento de produto (o documento vence).
import { AGENTES, type IdAgente } from '@core/agentes.ts';
import { Icone, type NomeIcone } from '@/components/Icone';
import { CabecalhoTela } from '@/components/Vazio';
import { Rotinas } from './Rotinas';

const PRINCIPIOS = [
  { titulo: 'Lana aprova o que é público', texto: 'Nenhuma oferta ou post sai sem um toque dela. Resposta automática só nos temas que ela aprovou antes.' },
  { titulo: 'Nada automático no WhatsApp', texto: 'Telegram publica por bot. WhatsApp é sempre copiar e colar, para proteger o número.' },
  { titulo: 'Números só do painel', texto: 'Comissões e vendas vêm do relatório oficial de afiliados. Nada é estimado ou inventado.' },
];

type Cor = 'av-o' | 'av-p' | 'av-g' | 'av-s';
interface Passo {
  icone: NomeIcone;
  cor: Cor;
  titulo: string;
  texto?: string;
  chips?: string[];
  lana?: boolean;
}

const CAMINHO_OFERTA: Passo[] = [
  { icone: 'tag', cor: 'av-s', titulo: 'Fontes', chips: ['Painel de afiliados Shopee', 'Pedidos das amigas', 'Calendário de datas', 'Mercado Livre (versão 3)'] },
  { icone: 'search', cor: 'av-o', titulo: 'Caçadora de Ofertas', texto: 'Busca, guarda o histórico de preço e pontua cada oferta' },
  { icone: 'pen', cor: 'av-p', titulo: 'Redatora', texto: 'Texto no tom da Lana, arte da marca, roteiro de vídeo' },
  { icone: 'shield', cor: 'av-g', titulo: 'Guardiã', texto: 'Confere preço, aviso de comissão, cadência e links repetidos' },
  { icone: 'heart', cor: 'av-o', titulo: 'Lana aprova', texto: 'Aprovar, pular ou pedir outra versão', lana: true },
  { icone: 'clock', cor: 'av-s', titulo: 'Agendadora', texto: 'Telegram sai sozinho no horário de pico. WhatsApp fica pronto para um toque.' },
  { icone: 'chart', cor: 'av-p', titulo: 'Analista', texto: 'Lê o relatório de conversões por canal e calcula os indicadores' },
];

const CAMINHO_SEGUIDOR: Passo[] = [
  { icone: 'radar', cor: 'av-g', titulo: 'Radar de Comunidades', texto: 'Acha lugares onde o público está e confere as regras de cada um' },
  { icone: 'heart', cor: 'av-o', titulo: 'Lana pede permissão', texto: 'Mensagem pronta para o administrador', lana: true },
  { icone: 'link', cor: 'av-p', titulo: 'Convite com link de entrada', texto: 'Cada lugar tem o seu link' },
  { icone: 'users', cor: 'av-s', titulo: 'Página de entrada', texto: 'Conta o clique e oferece seguir no WhatsApp ou no Telegram' },
  { icone: 'pulse', cor: 'av-p', titulo: 'Analista', texto: 'Cliques por origem e crescimento depois de cada divulgação' },
];

const VISUAL: Record<IdAgente, { icone: NomeIcone; cor: Cor }> = {
  cacadora: { icone: 'search', cor: 'av-o' },
  redatora: { icone: 'pen', cor: 'av-p' },
  guardia: { icone: 'shield', cor: 'av-g' },
  agendadora: { icone: 'clock', cor: 'av-s' },
  analista: { icone: 'chart', cor: 'av-p' },
  coach: { icone: 'flag', cor: 'av-o' },
  radar: { icone: 'radar', cor: 'av-g' },
  atendente: { icone: 'users', cor: 'av-s' },
};

function Caminho({ passos }: { passos: Passo[] }) {
  return (
    <ol className="flow" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {passos.map((p, i) => (
        <li key={p.titulo + i} style={{ display: 'contents' }}>
          {i > 0 ? (
            <div className="f-arrow" aria-hidden="true">
              <Icone nome="down" />
            </div>
          ) : null}
          <div className={`f-step${p.lana ? ' gatekeeper' : ''}`}>
            <span className={`av ${p.cor}`}>
              <Icone nome={p.icone} />
            </span>
            <div>
              <b>{p.titulo}</b>
              {p.texto ? <span>{p.texto}</span> : null}
              {p.chips ? (
                <div className="f-chips">
                  {p.chips.map((c) => (
                    <em key={c}>{c}</em>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function ComoFunciona() {
  return (
    <section className="view" aria-labelledby="h-agentes">
      <CabecalhoTela
        eyebrow="Como funciona"
        titulo="Oito agentes trabalhando para a Lana"
        lead="Os agentes fazem o trabalho repetitivo de procurar, escrever, conferir, agendar, atender, divulgar e medir. Tudo que vai para o público passa pela aprovação dela."
      />

      <div className="principles">
        {PRINCIPIOS.map((p) => (
          <div className="principle" key={p.titulo}>
            <b>{p.titulo}</b>
            <p>{p.texto}</p>
          </div>
        ))}
      </div>

      <Rotinas />

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h2>O caminho de uma oferta</h2>
          </div>
          <Caminho passos={CAMINHO_OFERTA} />
          <div className="f-loop">
            <Icone nome="loop" />
            <span>O que vendeu volta para a Caçadora ajustar a busca e para a Coach do Plano ajustar o roteiro do dia seguinte.</span>
          </div>
          <div className="card-head" style={{ marginTop: 24 }}>
            <h2>O caminho de um novo seguidor</h2>
          </div>
          <Caminho passos={CAMINHO_SEGUIDOR} />
        </div>

        <div className="stack">
          <div className="agents">
            {AGENTES.map((a) => (
              <div className="card agent" key={a.id}>
                <div className="agent-head">
                  <span className={`av ${VISUAL[a.id].cor}`}>
                    <Icone nome={VISUAL[a.id].icone} />
                  </span>
                  <h3>{a.nome}</h3>
                </div>
                <p className="does">{a.faz}.</p>
                <dl>
                  <dt>Quando</dt>
                  <dd>{a.quando}</dd>
                  <dt>Onde</dt>
                  <dd>{a.onde}</dd>
                  <dt>Nunca</dt>
                  <dd>{a.nunca}</dd>
                </dl>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Ordem de construção</h2>
        </div>
        <ul className="roadmap">
          <li>
            <span className="pill pill-plum">Versão 1</span>
            <b>Achar e enviar</b>
            <p>Caçadora, Redatora, Guardiã e Agendadora. Fila de aprovação, Telegram automático e texto pronto para o WhatsApp.</p>
          </li>
          <li>
            <span className="pill pill-sun">Versão 2</span>
            <b>Crescer e medir</b>
            <p>Radar de Comunidades, página de entrada com link por origem, aba de Audiência, Analista, Coach do Plano e a Atendente no Telegram e no formulário.</p>
          </li>
          <li>
            <span className="pill pill-ok">Versão 3</span>
            <b>Ampliar</b>
            <p>Mercado Livre, número oficial da Precinho no WhatsApp com a Atendente e produtos campeões indo para a loja.</p>
          </li>
          <li className="gated">
            <span className="pill pill-extra">Versão 4</span>
            <b>Investir</b>
            <p className="trigger">
              Gatilho: comissão líquida de um salário mínimo (R$ 1.621) ou mais por 3 meses seguidos, com R$ 7,37/h ou mais
            </p>
            <p>
              Anúncios começam com 10% da comissão líquida do mês anterior e podem chegar a 20%, com teto de custo por seguidor. A Produtora de Vídeo entra com até 10%, depois de 8
              vídeos manuais medidos. Anúncios e vídeos somados ficam em até 30%. A Lana revisa cada vídeo antes de publicar.
            </p>
          </li>
        </ul>
      </div>
    </section>
  );
}
