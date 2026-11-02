// Cartões da tela Resultados (F-23). Sem dado, cada cartão diz em palavras o que falta.
import { useState, type FormEvent } from 'react';
import { dataCurta, dataPorExtenso, porcento, reais } from '@core/formato.ts';
import { CALC_FAIXA_MEDIA, CALC_PADRAO, vendasNecessarias } from '@core/analista/calculadora.ts';
import { AVISO_NOVEMBRO, ROTULO_RESULTADO, type Limites, type ResultadoGate } from '@core/analista/gates.ts';
import { progressoInvestimento, ISENCAO_IR_MENSAL, FORMALIZACAO_LIMITE, INVESTIMENTO_LIQUIDA, type AvaliacaoInvestimento } from '@core/analista/gatilhos.ts';
import { formatar, INDICADORES_DEF, type Indicador, type IdIndicador, type LeituraGate } from '@core/analista/painel.ts';
import type { LinhaRegra } from '@core/analista/regras.ts';
import { ROTULO_CAMPO, OBRIGATORIOS } from '@core/analista/conversoes.ts';
import { useToast } from '@/components/Toast';
import { useImportarCsv, useInformarPagamento, useRegistrarGate, type Decisao, type Importacao, type Resumo } from './dados';

// ---------------------------------------------------------------------------
export function TabelaIndicadores({ itens, metas, linhaDeBase }: { itens: Indicador[]; metas: Partial<Record<IdIndicador, number>>; linhaDeBase: boolean }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Indicadores do plano</h2>
        {linhaDeBase ? <span className="pill pill-sun">Linha de base em construção</span> : <span className="pill pill-ok">Metas da fase 2 definidas</span>}
      </div>
      <div className="tablewrap">
        <table className="ktable">
          <thead>
            <tr>
              <th>Indicador</th>
              <th>Hoje</th>
              <th>Meta fase 2</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => {
              const meta = metas[i.id];
              return (
                <tr key={i.id}>
                  <td>
                    {i.nome}
                    <div className="how">{i.como}</div>
                  </td>
                  <td className="v">
                    {i.valor === null ? <span className="muted">{i.vazio}</span> : formatar(i.valor, i.formato)}
                    {i.nota ? <div className="how">{i.nota}</div> : null}
                  </td>
                  <td className="v">
                    {meta === undefined ? (
                      <span className="muted">no gate do dia 30</span>
                    ) : (
                      `${i.id === 'taxa_saida' ? 'abaixo de ' : ''}${formatar(meta, i.formato)}`
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>
        Bruta e líquida não se misturam: a bruta sai do relatório de conversões; a líquida é o valor pago, após retenções. Funil aproximado: os apps não identificam a
        pessoa, então as taxas comparam totais do mesmo período.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function Calculadora() {
  const [desejada, setDesejada] = useState<number>(CALC_PADRAO.desejada);
  const [media, setMedia] = useState<number>(CALC_PADRAO.mediaPct);
  const r = vendasNecessarias(desejada, media / 100);
  return (
    <div className="card calc">
      <div>
        <h2>Quanto preciso vender?</h2>
        <p className="small muted">Conta de chegada do plano. Mexa e veja o efeito da Comissão Extra. A média é um cenário, não uma taxa garantida.</p>
      </div>
      <div className="field">
        <label htmlFor="calc-desejada">Comissão bruta desejada por mês (R$)</label>
        <input id="calc-desejada" type="number" min={0} step={100} inputMode="numeric" value={Number.isFinite(desejada) ? desejada : ''} onChange={(e) => setDesejada(e.target.valueAsNumber)} />
      </div>
      <div className="field">
        <label htmlFor="calc-media">Comissão média das vendas</label>
        <div className="rangerow">
          <input id="calc-media" type="range" min={CALC_FAIXA_MEDIA.min} max={CALC_FAIXA_MEDIA.max} step={1} value={media} onChange={(e) => setMedia(Number(e.target.value))} />
          <output htmlFor="calc-media">{media}%</output>
        </div>
      </div>
      <div className="result" aria-live="polite">
        <p>Vendas atribuídas aos seus links por mês</p>
        <div className="big">{r ? reais(r.mes) : 'informe um valor'}</div>
        <p>{r ? `Cerca de ${reais(r.dia)} por dia. Valores antes das retenções.` : 'A comissão desejada precisa ser maior que zero.'}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
const OPCOES: ResultadoGate[] = ['escalar', 'ajustar', 'parar'];

export function CartaoGate({ leitura, decisao, itens, limites }: { leitura: LeituraGate; decisao: Decisao | undefined; itens: Indicador[]; limites: Limites }) {
  const { datas, avaliacao } = leitura;
  const ref = reais(limites.valorHora);
  const piso = reais(limites.valorHoraParar);
  const lim = porcento(limites.limiteQueda);
  const titulo = datas.gate === 'dia60' ? 'Nova leitura do dia 60' : `Gate do dia ${datas.n}`;
  const rec = avaliacao.resultado;
  return (
    <div className="card gate">
      <h2>
        {titulo} · {dataPorExtenso(datas.data)}
      </h2>
      <p className="small muted">
        A Analista calcula a comissão por hora de operação, sem as horas de montagem, pela comissão bruta dos dias {dataCurta(datas.inicio)} a {dataCurta(datas.fim)} (pendentes e
        concluídas, sem canceladas). Referência: o valor-hora do salário mínimo, {ref}. Recalculado quando o pagamento chegar.
      </p>
      <ul>
        <li>
          <b>Escalar:</b> {ref}/h ou mais, e nenhuma semana com taxa de saída acima de {lim}
        </li>
        <li>
          <b>Ajustar:</b> abaixo de {ref}/h, ou uma semana acima de {lim}. Troca de nicho ou de curadoria, com nova leitura no dia 60.
        </li>
        <li>
          <b>Parar ou repensar:</b> abaixo de {piso}/h e sem alta nas duas últimas semanas
        </li>
      </ul>

      <div className="result" aria-live="polite">
        <p>
          {leitura.periodo.fim < datas.inicio
            ? `O plano começa em ${dataCurta(datas.inicio)}`
            : leitura.parcial
              ? `Leitura parcial, até ${dataCurta(leitura.periodo.fim)}`
              : 'Leitura do gate'}
        </p>
        <div className="big">{rec ? ROTULO_RESULTADO[rec] : 'aguardando dados'}</div>
        <p>
          Comissão por hora: {leitura.h === null ? 'aguardando dados' : `${reais(leitura.h)}/h`} ({leitura.horas.toLocaleString('pt-BR')} h de operação). Comissão por 1.000
          seguidores: {leitura.porMil === null ? 'aguardando dados' : reais(leitura.porMil)}.
        </p>
        <p>{avaliacao.motivo}</p>
      </div>
      {leitura.taxasSemanais.length ? (
        <p className="small muted">
          Quedas semanais (maior entre os canais):{' '}
          {leitura.taxasSemanais.map((t) => `${dataCurta(t.inicio)}: ${t.taxa === null ? 'sem dado' : porcento(t.taxa)}`).join('; ')}.
        </p>
      ) : null}
      {datas.gate === 'dia30' ? <p className="small muted">{AVISO_NOVEMBRO}</p> : null}
      {datas.gate === 'dia90' ? <p className="small muted">O gate do dia 90 usa o mesmo cálculo e decide formalização e novos marketplaces.</p> : null}

      {decisao ? (
        <p className="small">
          <b>Decisão registrada:</b> {ROTULO_RESULTADO[decisao.decisao]}
          {decisao.recomendacao && decisao.recomendacao !== decisao.decisao ? ` (a regra recomendava ${ROTULO_RESULTADO[decisao.recomendacao]})` : ''}
          {decisao.nota ? `. ${decisao.nota}` : ''}
        </p>
      ) : leitura.aberto ? (
        <RegistrarDecisao leitura={leitura} itens={itens} />
      ) : (
        <p className="small muted">A decisão é registrada por Lana e Marcus a partir de {dataPorExtenso(datas.data)}.</p>
      )}
    </div>
  );
}

function RegistrarDecisao({ leitura, itens }: { leitura: LeituraGate; itens: Indicador[] }) {
  const toast = useToast();
  const registrar = useRegistrarGate();
  const [decisao, setDecisao] = useState<ResultadoGate | null>(leitura.avaliacao.resultado);
  const [nota, setNota] = useState('');
  const [metas, setMetas] = useState<Partial<Record<IdIndicador, string>>>({});
  const comMetas = leitura.datas.gate === 'dia30';

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!decisao) return;
    const valores: Partial<Record<IdIndicador, number>> = {};
    for (const def of INDICADORES_DEF) {
      const t = metas[def.id];
      if (!t) continue;
      const n = Number(t.replace(/\./g, '').replace(',', '.'));
      if (Number.isFinite(n)) valores[def.id] = def.formato === 'porcento' ? n / 100 : n;
    }
    registrar.mutate(
      {
        gate: leitura.datas.gate,
        recomendacao: leitura.avaliacao.resultado,
        decisao,
        nota,
        numeros: { periodo: leitura.periodo, comissao: leitura.comissao, horas: leitura.horas, h: leitura.h, por_mil: leitura.porMil, quedas: leitura.taxasSemanais, indicadores: itens.map((i) => ({ id: i.id, valor: i.valor })) },
        metas: comMetas ? valores : {},
      },
      { onSuccess: () => toast('Decisão registrada.'), onError: (err) => toast(`Não deu para registrar: ${err.message}`) },
    );
  }

  return (
    <form onSubmit={enviar} className="calc" aria-label="Registrar a decisão do gate">
      <div className="field">
        <span className="small" style={{ fontWeight: 800 }}>
          Decisão de Lana e Marcus
        </span>
        <div className="seg" role="group" aria-label="Decisão">
          {OPCOES.map((o) => (
            <button key={o} type="button" aria-pressed={decisao === o} onClick={() => setDecisao(o)}>
              {ROTULO_RESULTADO[o]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor={`nota-${leitura.datas.gate}`}>Observação (opcional)</label>
        <input id={`nota-${leitura.datas.gate}`} className="input" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} />
      </div>
      {comMetas ? (
        <fieldset className="calc" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ fontWeight: 800 }}>
            Metas da fase 2 (preenchem a coluna "Meta fase 2")
          </legend>
          {INDICADORES_DEF.map((def) => (
            <div className="field" key={def.id}>
              <label htmlFor={`meta-${def.id}`}>
                {def.nome}
                {def.formato === 'porcento' ? ' (%)' : def.formato.startsWith('reais') ? ' (R$)' : ''}
              </label>
              <input id={`meta-${def.id}`} type="number" step="any" min={0} inputMode="decimal" value={metas[def.id] ?? ''} onChange={(e) => setMetas({ ...metas, [def.id]: e.target.value })} />
            </div>
          ))}
        </fieldset>
      ) : null}
      <button className="btn btn-primary" type="submit" disabled={!decisao || registrar.isPending}>
        Registrar decisão
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
export function CartaoInvestimento({ a }: { a: AvaliacaoInvestimento }) {
  const ult = a.liquidaUltimoMes;
  const pct = Math.round(progressoInvestimento(a) * 100);
  return (
    <div className="card gate">
      <h2>Gatilho de investimento</h2>
      <p className="small muted">Libera a versão 4, com anúncios e vídeos de IA, quando tudo isto for verdade:</p>
      <ul>
        {Object.values(a.condicoes).map((c) => (
          <li key={c.texto}>
            {c.ok ? <b>Cumprido: </b> : null}
            {c.texto}
          </li>
        ))}
      </ul>
      <div className="progress" role="img" aria-label={`Progresso até o gatilho: ${a.mesesSeguidos} de 3 meses`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="small muted">
        Comissão líquida do mês: {ult?.valor != null ? reais(ult.valor) : 'aguardando pagamento'} de {reais(INVESTIMENTO_LIQUIDA)}. Meses seguidos acima: {Math.min(a.mesesSeguidos, 3)} de 3.
      </p>
      {a.liberado ? <span className="pill pill-ok">Versão 4 liberada</span> : null}
    </div>
  );
}

export function AlertaFormalizacao({ disparou, meses }: { disparou: boolean; meses: number }) {
  if (!disparou) return null;
  return (
    <div className="aviso erro" role="alert">
      Comissão bruta acima de {reais(FORMALIZACAO_LIMITE)} por {meses} meses seguidos. Hora de conversar com um contador antes de chegar a {reais(ISENCAO_IR_MENSAL)}, limite da
      isenção mensal de IR. A plataforma não faz nada fiscal.
    </div>
  );
}

// ---------------------------------------------------------------------------
export function CartaoRegras({ regras }: { regras: LinhaRegra[] }) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Regras automáticas</h2>
          <p>Valores vigentes. Lana e Marcus recalibram no dia 90, com os números da Analista.</p>
        </div>
      </div>
      <div className="tablewrap">
        <table className="ktable">
          <thead>
            <tr>
              <th>Regra</th>
              <th>Quando dispara</th>
              <th>O que acontece</th>
            </tr>
          </thead>
          <tbody>
            {regras.map((r, i) => (
              <tr key={i}>
                <td>{r.regra}</td>
                <td>{r.quando}</td>
                <td>{r.acontece}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>
        Valor do seguidor = comissão líquida do mês ÷ seguidores × meses que um seguidor fica. Os meses que ele fica = 1 ÷ queda mensal, contando no máximo 6.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function Grafico({ mostrar, dias, serie }: { mostrar: boolean; dias: number; serie: { dia: string; comissao: number }[] }) {
  if (!mostrar) {
    return (
      <div className="card">
        <div className="card-head">
          <h2>Comissão por dia</h2>
        </div>
        <div className="chart-empty">
          <p>
            O gráfico aparece depois de 7 dias de dados do painel de afiliados.{dias > 0 ? ` Até agora: ${dias} ${dias === 1 ? 'dia' : 'dias'}.` : ''}
          </p>
        </div>
      </div>
    );
  }
  const max = Math.max(...serie.map((s) => s.comissao), 0.01);
  const L = 600;
  const A = 180;
  const w = L / serie.length;
  const total = serie.reduce((a, s) => a + s.comissao, 0);
  return (
    <div className="card">
      <div className="card-head">
        <h2>Comissão por dia</h2>
        <p>
          Bruta, de {dataCurta(serie[0].dia)} a {dataCurta(serie[serie.length - 1].dia)}. Maior dia: {reais(max === 0.01 ? 0 : max)}.
        </p>
      </div>
      <svg viewBox={`0 0 ${L} ${A + 20}`} role="img" aria-label={`Comissão bruta por dia; total no período ${reais(total)}`} style={{ width: '100%', height: 'auto' }}>
        {serie.map((s, i) => {
          const h = (s.comissao / max) * A;
          return (
            <g key={s.dia}>
              <title>{`${dataCurta(s.dia)}: ${reais(s.comissao)}`}</title>
              <rect x={i * w + 2} y={A - h} width={Math.max(1, w - 4)} height={h} rx={3} fill="var(--orange)" />
              {i % Math.ceil(serie.length / 8) === 0 ? (
                <text x={i * w + w / 2} y={A + 15} textAnchor="middle" fontSize="11" fill="var(--muted)">
                  {dataCurta(s.dia)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function CartaoResumo({ resumo }: { resumo: Resumo | null }) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Resumo da semana</h2>
          <p>Escrito pela Analista toda segunda, só com os números calculados. Texto com número de fora é recusado.</p>
        </div>
        {resumo?.simulado ? <span className="pill pill-std">Simulado</span> : null}
      </div>
      {resumo ? (
        <>
          <p className="small muted">
            Semana de {dataCurta(resumo.semana_inicio)} a {dataCurta(resumo.semana_fim)}
          </p>
          <p style={{ whiteSpace: 'pre-line' }}>{resumo.texto}</p>
        </>
      ) : (
        <p className="muted">O primeiro resumo sai na segunda-feira depois da primeira semana de dados.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function CartaoImportacao({ ultima }: { ultima: Importacao | null }) {
  const toast = useToast();
  const importar = useImportarCsv();
  const pagar = useInformarPagamento();
  const [mes, setMes] = useState('');
  const [valor, setValor] = useState('');

  async function aoEscolher(arquivo: File | undefined) {
    if (!arquivo) return;
    const conteudo = await arquivo.text();
    importar.mutate(
      { arquivo: arquivo.name, conteudo },
      {
        onSuccess: (r) =>
          toast(r.estado === 'erro' ? 'Importação com erro. Veja o motivo no cartão.' : `${r.gravadas} ${r.gravadas === 1 ? 'linha importada' : 'linhas importadas'}.`),
        onError: (e) => toast(`Não deu para importar: ${e.message}`),
      },
    );
  }

  function informar(e: FormEvent) {
    e.preventDefault();
    const n = Number(valor.replace(/\./g, '').replace(',', '.'));
    if (!/^\d{4}-\d{2}$/.test(mes) || !Number.isFinite(n) || n < 0) return toast('Informe o mês e o valor recebido.');
    pagar.mutate({ mes, valor: n }, { onSuccess: () => toast('Pagamento registrado.'), onError: (err) => toast(`Não deu para registrar: ${err.message}`) });
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Relatório de conversões</h2>
          <p>Enquanto a API não estiver ligada, exporte o relatório de conversões no painel de afiliados e importe o CSV aqui. Reimportar não duplica.</p>
        </div>
        <label className="btn btn-primary filebtn">
          {importar.isPending ? 'Importando...' : 'Importar CSV'}
          <input type="file" accept=".csv,text/csv" aria-label="Escolher o arquivo CSV do relatório de conversões" disabled={importar.isPending} onChange={(e) => aoEscolher(e.target.files?.[0])} />
        </label>
      </div>
      {ultima ? <EstadoImportacao imp={ultima} /> : <p className="muted">Nenhuma importação ainda: os números aparecem depois da primeira.</p>}
      <p className="small muted" style={{ marginTop: 10 }}>
        Colunas obrigatórias: {OBRIGATORIOS.map((c) => ROTULO_CAMPO[c]).join(', ')}. Os códigos Sub_id1 a Sub_id5 separam os canais.
      </p>

      <form
        onSubmit={informar}
        style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}
        aria-label="Informar a comissão líquida recebida"
      >
        <p className="small" style={{ flexBasis: '100%' }}>
          <b>Comissão líquida recebida</b>: se a API não trouxer o pagamento, informe uma vez por mês o valor que caiu na conta.
        </p>
        <div className="field">
          <label htmlFor="pag-mes">Mês de referência</label>
          <input id="pag-mes" className="input" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pag-valor">Valor recebido (R$)</label>
          <input id="pag-valor" type="number" min={0} step="0.01" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        </div>
        <button className="btn btn-ghost" type="submit" disabled={pagar.isPending}>
          Registrar pagamento
        </button>
      </form>
    </div>
  );
}

function EstadoImportacao({ imp }: { imp: Importacao }) {
  const quando = new Date(imp.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fonte = imp.origem === 'api' ? 'API' : `CSV${imp.arquivo_nome ? ` "${imp.arquivo_nome}"` : ''}`;
  if (imp.estado === 'erro') {
    return (
      <div className="aviso erro" role="alert">
        Importação com erro ({fonte}, {quando}): {imp.mensagem ?? 'motivo não informado'}.
        {imp.erros.length ? ` Primeiras linhas recusadas: ${imp.erros.slice(0, 3).map((e) => `linha ${e.linha} (${e.motivo})`).join('; ')}.` : ''}
      </div>
    );
  }
  return (
    <div className={imp.estado === 'parcial' ? 'aviso' : 'small'} role="status">
      Última importação ({fonte}, {quando}): {imp.linhas_gravadas} {imp.linhas_gravadas === 1 ? 'linha gravada' : 'linhas gravadas'}
      {imp.periodo_inicio && imp.periodo_fim ? `, pedidos de ${dataCurta(imp.periodo_inicio)} a ${dataCurta(imp.periodo_fim)}` : ''}.
      {imp.linhas_com_erro
        ? ` ${imp.linhas_com_erro} ${imp.linhas_com_erro === 1 ? 'linha recusada' : 'linhas recusadas'}: ${imp.erros.slice(0, 3).map((e) => `linha ${e.linha} (${e.motivo})`).join('; ')}.`
        : ''}
    </div>
  );
}
