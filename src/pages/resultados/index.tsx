// Resultados (F-23): medir e decidir pelos números do painel de afiliados.
import { CabecalhoTela } from '@/components/Vazio';
import { useConfig } from '@/lib/config';
import { gatesVisiveis } from '@core/analista/gates.ts';
import { indicadores, lerFormalizacao, lerGate, lerGrafico, lerInvestimento } from '@core/analista/painel.ts';
import { regrasAutomaticas } from '@core/analista/regras.ts';
import { AlertaFormalizacao, Calculadora, CartaoGate, CartaoImportacao, CartaoInvestimento, CartaoRegras, CartaoResumo, Grafico, TabelaIndicadores } from './Cartoes';
import { useDadosAnalista, useDecisoes, useMetas, useUltimaImportacao, useUltimoResumo } from './dados';

export default function Pagina() {
  const config = useConfig();
  const cfg = config.data;
  return (
    <section className="view" aria-labelledby="h-resultados">
      <CabecalhoTela
        eyebrow="Analista"
        titulo="Resultados"
        lead="Os números vêm do relatório de conversões do painel, separados por canal com um código em cada link. As metas são definidas no gate do dia 30, com dados reais."
      />
      {cfg ? <Conteudo cfg={cfg} /> : <p className="carregando">Carregando...</p>}
    </section>
  );
}

function Conteudo({ cfg }: { cfg: NonNullable<ReturnType<typeof useConfig>['data']> }) {
  const dados = useDadosAnalista(cfg);
  const decisoes = useDecisoes();
  const metas = useMetas();
  const importacao = useUltimaImportacao();
  const resumo = useUltimoResumo();

  if (dados.isLoading) return <p className="carregando">Carregando os números...</p>;
  if (dados.error) {
    return (
      <div className="aviso erro" role="alert">
        Não deu para ler os números agora: {dados.error.message}
      </div>
    );
  }
  const d = dados.data!;
  const itens = indicadores(d);
  const lista = decisoes.data ?? [];
  const dec30 = lista.find((x) => x.gate === 'dia30');
  const g30 = lerGate(d, 'dia30');
  const visiveis = gatesVisiveis(dec30?.decisao ?? g30.avaliacao.resultado);
  const leituras = visiveis.map((g) => (g === 'dia30' ? g30 : lerGate(d, g)));
  const formal = lerFormalizacao(d);
  const metasDef = metas.data ?? {};

  return (
    <>
      <AlertaFormalizacao disparou={formal.disparou} meses={formal.mesesSeguidos} />
      {d.audiencia === null ? (
        <div className="aviso" role="status">
          Seguidores e taxa de saída aguardam os dados da Audiência (registro semanal do WhatsApp e contagem do bot do Telegram).
        </div>
      ) : null}

      <div className="grid-2">
        <TabelaIndicadores itens={itens} metas={metasDef} linhaDeBase={Object.keys(metasDef).length === 0} />
        <div className="stack">
          <Calculadora />
          {leituras.map((l) => (
            <CartaoGate key={l.datas.gate} leitura={l} decisao={lista.find((x) => x.gate === l.datas.gate)} itens={itens} limites={d.limites} />
          ))}
          <CartaoInvestimento a={lerInvestimento(d, cfg.limiteQuedaInicial)} />
        </div>
      </div>

      <CartaoImportacao ultima={importacao.data ?? null} />
      <Grafico {...lerGrafico(d)} />
      <CartaoResumo resumo={resumo.data ?? null} />
      <CartaoRegras
        regras={regrasAutomaticas({
          cadenciaInicial: cfg.cadenciaInicial,
          cadenciaMaxima: cfg.cadenciaMaxima,
          cadenciaMinima: cfg.cadenciaMinima,
          limiteQuedaInicial: cfg.limiteQuedaInicial,
        })}
      />
    </>
  );
}
