// Audiência (F-22, seção 5.12): quem chega, de onde vem, quem fica e quem compra.
import { useState, type FormEvent } from 'react';
import {
  calcularEngajamento,
  calcularFunil,
  calcularTotais,
  leituraPorOrigem,
  lerDivulgacoes,
  linhaDeBaseEmConstrucao,
  serieCrescimento,
  textoLeitura,
  totalValido,
  type RegistroSeguidores,
} from '@core/audiencia/index.ts';
import { dataCurta, dataLocal, dataPorExtenso, porcento, reais } from '@core/formato.ts';
import { CabecalhoTela } from '@/components/Vazio';
import { Icone } from '@/components/Icone';
import { useToast } from '@/components/Toast';
import { useAcao, useConsulta } from '@/lib/dados';
import { modoLocal, supabase } from '@/lib/supabase';
import { Crescimento } from './Crescimento';
import { buscarAudiencia, buscarLeituraPendente, DADOS_VAZIOS, extensaoDoPrint, type LeituraPrint } from './dados';

const AGUARDANDO = 'aguardando dados';
const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function Num({ v, fmt = (n: number) => inteiro.format(n) }: { v: number | null; fmt?: (n: number) => string }) {
  return v === null ? <span className="muted" style={{ fontSize: 14, fontWeight: 700 }}>{AGUARDANDO}</span> : <>{fmt(v)}</>;
}

export default function Pagina() {
  const dados = useConsulta(['audiencia'], (sb) => buscarAudiencia(sb), DADOS_VAZIOS);
  const d = dados.data ?? DADOS_VAZIOS;
  const agora = new Date();
  const hoje = dataLocal(agora);

  const totais = calcularTotais(d.registros, d.eventos, agora);
  const desde7 = agora.getTime() - 7 * 86_400_000;
  const cliquesSemana = d.cliquesEntrada ? d.cliquesEntrada.filter((c) => c.em.getTime() > desde7).length : null;
  const funil = calcularFunil({ totais, cliquesEntrada: cliquesSemana, conversoes: d.conversoes, hoje });
  const engajamento = calcularEngajamento({ postsPorCanal: d.postsPorCanal, conversoes: d.conversoes, hoje });
  const telegramMedido = d.registros.some((r) => r.canal === 'tg');
  const origens = d.divulgacoes ? leituraPorOrigem(lerDivulgacoes(d.divulgacoes, d.cliquesEntrada ?? [], d.eventos, agora, telegramMedido)) : null;
  const serie = serieCrescimento(d.registros);

  return (
    <section className="view" aria-labelledby="h-audiencia">
      <CabecalhoTela
        eyebrow="Analista"
        titulo="Audiência da comunidade"
        lead="Quem chega, de onde vem, quem fica e quem compra. Os números entram sozinhos onde as plataformas permitem. O resto você informa uma vez por semana."
        acoes={linhaDeBaseEmConstrucao(d.registros) ? <span className="pill pill-sun">Linha de base em construção</span> : null}
      />

      {dados.isError ? (
        <div className="aviso erro" role="alert">
          Não foi possível carregar a Audiência agora. Tente de novo em instantes.
        </div>
      ) : null}

      <div className="kpis">
        <div className="kpi">
          <span className="k">Seguidores no WhatsApp</span>
          <span className="v"><Num v={totais.seguidoresWa} /></span>
          <span className="s">você informa toda segunda</span>
        </div>
        <div className="kpi">
          <span className="k">Inscritos no Telegram</span>
          <span className="v"><Num v={totais.inscritosTg} /></span>
          <span className="s">automático, pelo bot</span>
        </div>
        <div className="kpi">
          <span className="k">Novos na semana</span>
          <span className="v"><Num v={totais.novosNaSemana} /></span>
          <span className="s">diferença entre semanas</span>
        </div>
        <div className="kpi">
          <span className="k">Deixaram de seguir</span>
          <span className="v"><Num v={totais.deixaramDeSeguir} /></span>
          <span className="s">no WhatsApp aparece como queda no total</span>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><div><h2>Funil da comunidade</h2><p>Últimos 7 dias, do clique no convite ao pedido</p></div></div>
          <ol className="funnel">
            <li className="fstep"><div><b>Cliques nos links de entrada</b><span className="src src-auto">Página de entrada · automático</span></div><span className="v"><Num v={funil.cliquesEntrada} /></span></li>
            <li className="fconv"><Icone nome="down" /><span><Num v={funil.viramSeguidores} fmt={porcento} /> viram seguidores</span></li>
            <li className="fstep"><div><b>Novos seguidores</b><span className="src src-man">Telegram automático · WhatsApp semanal</span></div><span className="v"><Num v={funil.novosSeguidores} /></span></li>
            <li className="fconv"><Icone nome="down" /><span><Num v={funil.cliquesPorSeguidor} fmt={(n) => decimal.format(n)} /> cliques em ofertas por seguidor</span></li>
            <li className="fstep"><div><b>Cliques em ofertas</b><span className="src src-auto">Painel de afiliados por canal · automático</span></div><span className="v"><Num v={funil.cliquesOfertas} /></span></li>
            <li className="fconv"><Icone nome="down" /><span><Num v={funil.viramPedidos} fmt={porcento} /> viram pedidos</span></li>
            <li className="fstep"><div><b>Pedidos</b><span className="src src-auto">Painel de afiliados · automático</span></div><span className="v"><Num v={funil.pedidos} /></span></li>
          </ol>
          <p className="small muted" style={{ marginTop: 12 }}>
            Os apps não identificam a pessoa. O funil compara totais do mesmo período, então as taxas são aproximadas.
          </p>
        </div>

        <div className="stack">
          <WhatsAppDaSemana registros={d.registros} />
          <div className="card">
            <div className="card-head"><h2>De onde vem cada número</h2></div>
            <div className="twocol">
              <div>
                <h3 className="src-auto">Automático</h3>
                <ul>
                  <li>Inscritos e saídas do Telegram, pelo bot do canal</li>
                  <li>Cliques por origem, pela página de entrada</li>
                  <li>Cliques, pedidos e comissão por canal, pelo painel de afiliados</li>
                </ul>
              </div>
              <div>
                <h3 className="src-man">Você informa</h3>
                <ul>
                  <li>Seguidores do canal do WhatsApp, uma vez por semana, digitando ou com um print que a IA lê</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div><h2>Entradas por origem</h2><p>Quanto cada lugar do Radar trouxe</p></div></div>
        {origens && origens.length ? (
          <div className="tablewrap">
            <table className="ktable">
              <thead>
                <tr><th>Origem</th><th>Última divulgação</th><th>Cliques no link</th><th>Novos no Telegram em 48 h</th><th>Leitura</th></tr>
              </thead>
              <tbody>
                {origens.map((l) => (
                  <tr key={l.divulgacao.id}>
                    <td>{l.divulgacao.lugar}</td>
                    <td className="v">{dataCurta(dataLocal(l.divulgacao.em))}</td>
                    <td className="v">{inteiro.format(l.cliques)}</td>
                    <td className="v"><Num v={l.novosTelegram} /></td>
                    <td className={l.estado === 'limpa' ? '' : 'muted'}>{textoLeitura(l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            {origens ? 'Nenhuma divulgação registrada ainda. Quando você tocar em "Divulguei hoje" no Radar, a leitura aparece aqui.' : 'Aguardando dados do Radar e da página de entrada.'}
          </p>
        )}
        <p className="small muted" style={{ marginTop: 12 }}>
          Os apps não dizem por qual link cada pessoa seguiu. Por isso a Audiência cruza os cliques de cada origem com o crescimento nas 48 horas
          seguintes. Espaçar as divulgações em 48 horas deixa essa leitura limpa. O WhatsApp é informado uma vez por semana e não entra nessa leitura.
        </p>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><div><h2>Engajamento por canal</h2><p>Últimos 7 dias. Cada canal usa um código próprio nos links de oferta</p></div></div>
          <div className="tablewrap">
            <table className="ktable">
              <thead><tr><th>Canal</th><th>Posts na semana</th><th>Cliques por post</th><th>Pedidos</th><th>Comissão</th></tr></thead>
              <tbody>
                {engajamento.map((e) => (
                  <tr key={e.canal}>
                    <td>{e.canal === 'wa' ? 'Canal do WhatsApp' : 'Canal no Telegram'}</td>
                    <td className="v"><Num v={e.posts} /></td>
                    <td className="v"><Num v={e.cliquesPorPost} fmt={(n) => decimal.format(n)} /></td>
                    <td className="v"><Num v={e.pedidos} /></td>
                    <td className="v"><Num v={e.comissao} fmt={reais} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Crescimento</h2></div>
          {serie ? (
            <Crescimento serie={serie} />
          ) : (
            <div className="chart-empty"><p>O gráfico aparece depois de duas semanas de registros.</p></div>
          )}
        </div>
      </div>
    </section>
  );
}

function WhatsAppDaSemana({ registros }: { registros: RegistroSeguidores[] }) {
  const toast = useToast();
  const [valor, setValor] = useState('');
  const [enviando, setEnviando] = useState(false);
  const leitura = useConsulta(['audiencia', 'leitura-print'], buscarLeituraPendente, null, { refetchInterval: 10_000 });

  const salvar = useAcao(
    async (sb, total: number) => {
      const r = await sb.rpc('salvar_seguidores_wa', { p_total: total });
      if (r.error) throw new Error(r.error.message);
    },
    [['audiencia']],
  );

  const wa = registros.filter((r) => r.canal === 'wa').sort((a, b) => b.data.localeCompare(a.data));
  const primeiroRegistro = wa.length === 0;

  async function aoSalvar(ev: FormEvent) {
    ev.preventDefault();
    const n = Number(valor);
    if (valor.trim() === '' || !totalValido(n)) {
      toast('Digite o total de seguidores, só números.');
      return;
    }
    try {
      await salvar.mutateAsync(n);
      setValor('');
      toast(primeiroRegistro ? 'Salvo. Esse é o registro da linha de base.' : 'Seguidores do WhatsApp salvos.');
    } catch (e) {
      toast(`Não foi possível salvar: ${(e as Error).message}`);
    }
  }

  async function aoEscolherPrint(arquivo: File | undefined) {
    if (!arquivo) return;
    if (!supabase) {
      toast('Envio de print disponível quando o app estiver conectado.');
      return;
    }
    const ext = extensaoDoPrint(arquivo);
    if (!ext) {
      toast('Envie uma imagem (PNG, JPG, WEBP ou HEIC).');
      return;
    }
    setEnviando(true);
    try {
      const caminho = `wa/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from('prints').upload(caminho, arquivo, { contentType: arquivo.type || undefined });
      if (up.error) throw new Error(up.error.message);
      const r = await supabase.functions.invoke('audiencia-print', { body: { print_path: caminho } });
      if (r.error) {
        const corpo = await (r.error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error((corpo as { erro?: string } | null)?.erro ?? r.error.message);
      }
      toast('Print enviado. A Analista vai ler o número e você confirma antes de salvar.');
      await leitura.refetch();
    } catch (e) {
      toast(`Não foi possível enviar o print: ${(e as Error).message}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head"><div><h2>WhatsApp da semana</h2><p>O WhatsApp não entrega esse número para outros apps</p></div></div>
      <form className="wa-form" onSubmit={aoSalvar}>
        <div className="field">
          <label htmlFor="waCount">Seguidores do canal hoje</label>
          <input id="waCount" type="number" min="0" step="1" inputMode="numeric" placeholder="número" value={valor} onChange={(e) => setValor(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={salvar.isPending || modoLocal}>Salvar</button>
        <label className="btn btn-ghost filebtn" htmlFor="waShot" aria-disabled={enviando || modoLocal} style={enviando || modoLocal ? { opacity: 0.55 } : undefined}>
          {enviando ? 'Enviando...' : 'Enviar print'}
          <input id="waShot" type="file" accept="image/*" disabled={enviando || modoLocal} onChange={(e) => { void aoEscolherPrint(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </form>
      {leitura.data ? <ConfirmarLeitura leitura={leitura.data} /> : null}
      <ul className="walog">
        {wa.length === 0 ? (
          <li>Nenhum registro ainda. O primeiro vira a linha de base.</li>
        ) : (
          wa.slice(0, 4).map((r, i) => (
            <li key={r.data}>
              {dataPorExtenso(r.data)}: {inteiro.format(r.total)} seguidores{i === wa.length - 1 ? ' (linha de base)' : ''}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function ConfirmarLeitura({ leitura }: { leitura: LeituraPrint }) {
  const toast = useToast();
  const [valor, setValor] = useState(leitura.numero_lido !== null ? String(leitura.numero_lido) : '');
  const confirmar = useAcao(
    async (sb, total: number) => {
      const r = await sb.rpc('confirmar_leitura_print', { p_leitura: leitura.id, p_total: total });
      if (r.error) throw new Error(r.error.message);
    },
    [['audiencia']],
  );
  const descartar = useAcao(
    async (sb) => {
      const r = await sb.rpc('descartar_leitura_print', { p_leitura: leitura.id });
      if (r.error) throw new Error(r.error.message);
    },
    [['audiencia']],
  );

  if (leitura.estado === 'lendo') {
    return (
      <div className="aviso" role="status" style={{ marginTop: 12 }}>
        A Analista está lendo o print. O número aparece aqui para você confirmar.
        <button type="button" className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={() => descartar.mutate(undefined)}>Cancelar</button>
      </div>
    );
  }

  async function aoConfirmar(ev: FormEvent) {
    ev.preventDefault();
    const n = Number(valor);
    if (valor.trim() === '' || !totalValido(n)) {
      toast('Confira o total: só números.');
      return;
    }
    try {
      await confirmar.mutateAsync(n);
      toast('Confirmado e salvo.');
    } catch (e) {
      toast(`Não foi possível salvar: ${(e as Error).message}`);
    }
  }

  return (
    <form className="wa-form" onSubmit={aoConfirmar} style={{ marginTop: 12 }} aria-label="Confirmar número lido do print">
      <p className="small" style={{ width: '100%', margin: 0 }}>
        {leitura.numero_lido !== null
          ? 'A Analista leu este número no print. Confira e confirme antes de salvar.'
          : 'Não deu para ler o número no print. Digite o total que aparece nele.'}
        {leitura.trecho ? <span className="muted"> Trecho: "{leitura.trecho}"</span> : null}
      </p>
      <div className="field">
        <label htmlFor="waConfirm">Número do print</label>
        <input id="waConfirm" type="number" min="0" step="1" inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={confirmar.isPending}>Confirmar</button>
      <button type="button" className="btn btn-ghost" onClick={() => descartar.mutate(undefined)} disabled={descartar.isPending}>Descartar</button>
    </form>
  );
}
