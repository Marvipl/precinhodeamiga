// F-10 Tela Hoje: o dia montado em um só lugar (seção 4.2). Números da V2 mostram "aguardando dados".
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AGENTES, type IdAgente } from '@core/agentes.ts';
import { CONFIG } from '@core/config.ts';
import { dataLocal, dataPorExtenso, diaDaSemana, horaLocal } from '@core/formato.ts';
import { datasQueMovemVendas, diaDoPlano, emDiasTexto, faseDoDia, rotuloDiaDoPlano } from '@core/plano/index.ts';
import { ORCAMENTOS, ORCAMENTO_PADRAO, montarRoteiro, rodapeRoteiro, tarefasDoDia, type Orcamento } from '@core/roteiro.ts';
import { horasValidas } from '@core/tempo.ts';
import { Icone, type NomeIcone } from '@/components/Icone';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { useConfig } from '@/lib/config';
import { useAtividadesDesdeMeiaNoite, useDatasPico, useMarcarTarefa, useMarcasRoteiro, useResumoDia } from './dados';
import { inicioDoMes, useSessoesOperadoraMes } from './sessoes';
import { RegistroDeTempo } from './Sessoes';
import './hoje.css';

const CAMINHO: Record<string, string> = {
  ofertas: '/ofertas',
  publicar: '/publicar',
  radar: '/radar',
  audiencia: '/audiencia',
  comunidade: '/comunidade',
  plano: '/plano',
};

const ROSTO: Record<IdAgente, { icone: NomeIcone; av: string }> = {
  cacadora: { icone: 'search', av: 'av-o' },
  redatora: { icone: 'pen', av: 'av-p' },
  guardia: { icone: 'shield', av: 'av-g' },
  agendadora: { icone: 'clock', av: 'av-o' },
  analista: { icone: 'chart', av: 'av-s' },
  coach: { icone: 'flag', av: 'av-p' },
  radar: { icone: 'radar', av: 'av-g' },
  atendente: { icone: 'users', av: 'av-s' },
};

function maiuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "11.11", "02.12" */
function diaPonto(data: string): string {
  return `${data.slice(8, 10)}.${data.slice(5, 7)}`;
}

function horaCheia(iso: string): string {
  const h = horaLocal(new Date(iso));
  return h.endsWith(':00') ? `${Number(h.slice(0, 2))}h` : h.replace(':', 'h');
}

export default function Pagina() {
  const { perfil } = useAuth();
  const toast = useToast();
  const hoje = dataLocal();
  const { data: cfg } = useConfig();
  const inicioPlano = (cfg?.dataInicioPlano ?? CONFIG.dataInicioPlano.padrao) as string;
  const pausaGeral = !!cfg?.pausaGeral;

  const { data: resumo, isLoading: carregandoResumo } = useResumoDia(hoje);
  const { data: picos = [] } = useDatasPico();
  const { data: feed = [], isLoading: carregandoFeed } = useAtividadesDesdeMeiaNoite(hoje);
  const { data: marcas = {} } = useMarcasRoteiro(hoje);
  const { data: sessoesOp = [] } = useSessoesOperadoraMes();
  const marcar = useMarcarTarefa(hoje, perfil?.user_id);
  const [orcamento, setOrcamento] = useState<Orcamento>(ORCAMENTO_PADRAO);
  const [marcasLocais, setMarcasLocais] = useState<Record<string, boolean>>({});

  const dia = diaDoPlano(inicioPlano, hoje);
  const fase = faseDoDia(dia.dia);
  const datas = datasQueMovemVendas(picos, inicioPlano, hoje);
  const proximosPicos = datas.filter((d) => d.tipo === 'pico');
  const r = resumo;

  const roteiro = useMemo(
    () =>
      montarRoteiro(
        tarefasDoDia({
          diaDaSemana: diaDaSemana(hoje),
          ofertasPendentes: r?.ofertasPendentes ?? 0,
          enviosWhatsappPendentes: r?.enviosWhatsappPendentes ?? 0,
          artesStatus: r?.artesStatus ?? 0,
        }),
        orcamento,
      ),
    [r, hoje, orcamento],
  );
  const feitas = { ...marcas, ...marcasLocais };

  const horasMes = horasValidas(sessoesOp, inicioDoMes(hoje), new Date(8.64e15));
  const primeiroNome = perfil?.nome?.split(' ')[0] ?? '';
  const agentesPausados = pausaGeral || (r?.rotinasPausadas ?? 0) > 0;
  const naoRodaram = !carregandoFeed && feed.length === 0;

  function alternar(tarefa: string, feita: boolean) {
    setMarcasLocais((m) => ({ ...m, [tarefa]: feita }));
    marcar.mutate(
      { tarefa, feita },
      {
        onError: (e) => {
          setMarcasLocais((m) => ({ ...m, [tarefa]: !feita }));
          toast((e as Error).message);
        },
      },
    );
  }

  return (
    <section className="view" aria-labelledby="h-hoje">
      <div className="hello">
        <span className="date">
          {maiuscula(dataPorExtenso(hoje))} · {rotuloDiaDoPlano(dia)}
          {fase ? <span className="pill pill-plum hoje-fase">{fase.nome}</span> : null}
        </span>
        <h1 id="h-hoje">
          Olá{primeiroNome ? `, ${primeiroNome}` : ''}. Seu dia já está montado.
        </h1>
        <p className="lead">
          {pausaGeral
            ? 'Os agentes estão pausados. O que já foi preparado continua aqui; nada novo chega até a pausa acabar.'
            : naoRodaram
              ? 'Os agentes ainda não rodaram hoje. Assim que a Caçadora terminar, as ofertas aparecem aqui.'
              : 'Os agentes trabalharam de madrugada. Você só aprova, envia e segue o roteiro que cabe no seu tempo.'}
        </p>
      </div>

      {agentesPausados ? (
        <div className="aviso" role="note">
          <Icone nome="info" />
          <span>
            {pausaGeral ? 'Pausa geral ligada em Configurações.' : `${r?.rotinasPausadas} ${r?.rotinasPausadas === 1 ? 'rotina pausada' : 'rotinas pausadas'}.`} Veja o estado
            de cada rotina em <Link to="/como-funciona">Como funciona</Link>.
          </span>
        </div>
      ) : null}

      <div className="summary">
        <Link className="sum" to="/ofertas">
          <span className="k">Para aprovar</span>
          <span className="v num">
            {carregandoResumo ? '...' : r && r.ofertasPendentes > 0 ? `${r.ofertasPendentes} ${r.ofertasPendentes === 1 ? 'oferta' : 'ofertas'}` : 'Nenhuma'}
          </span>
          <span className="s">{r && r.ofertasPendentes > 0 ? 'Separadas e pontuadas pela Caçadora' : 'Aguardando a rodada da Caçadora'}</span>
        </Link>
        <Link className="sum" to="/publicar">
          <span className="k">Próximo envio</span>
          <span className="v num">{r?.proximoEnvio ? horaCheia(r.proximoEnvio.agendado_para) : 'Nenhum'}</span>
          <span className="s">
            {r?.proximoEnvio
              ? `${r.postsNoProximoBloco} ${r.postsNoProximoBloco === 1 ? 'post pronto' : 'posts prontos'} para o bloco${r.proximoEnvio.bloco_data === hoje ? ' de hoje' : ''}`
              : 'Nada agendado ainda'}
          </span>
        </Link>
        <Link className="sum" to="/plano">
          <span className="k">Próxima data de pico</span>
          <span className="v num">{proximosPicos[0] ? `${proximosPicos[0].nome} ${emDiasTexto(proximosPicos[0].emDias)}` : 'Nenhuma'}</span>
          <span className="s">
            {proximosPicos[1] ? `${proximosPicos[1].nome} ${emDiasTexto(proximosPicos[1].emDias)}` : proximosPicos[0] ? 'Última data cadastrada' : 'Cadastre as datas do próximo ano'}
          </span>
        </Link>
      </div>

      <div className="grid-2">
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <div>
                <h2>Seu roteiro de hoje</h2>
                <p>A Coach monta a lista pelo tempo que você tem agora.</p>
              </div>
            </div>
            <div className="budget">
              <span className="small muted" id="budgetLabel">
                Quanto tempo você tem agora?
              </span>
              <div className="seg" role="group" aria-labelledby="budgetLabel">
                {ORCAMENTOS.map((m) => (
                  <button key={m} type="button" aria-pressed={orcamento === m} onClick={() => setOrcamento(m)}>
                    {m} min
                  </button>
                ))}
              </div>
            </div>
            {roteiro.incluidas.length === 0 ? (
              <div className="empty hoje-vazio" role="status">
                <h3>{carregandoResumo ? 'Montando o roteiro...' : 'Nada pendente agora'}</h3>
                {!carregandoResumo ? <p>Quando chegarem ofertas, posts do bloco ou artes do Status, as tarefas aparecem aqui.</p> : null}
              </div>
            ) : (
              <ol className="route">
                {roteiro.incluidas.map((t) => {
                  const feita = !!feitas[t.id];
                  return (
                    <li key={t.id} className={`task${feita ? ' done' : ''}`}>
                      <input type="checkbox" id={`t-${t.id}`} aria-label={`Concluir: ${t.titulo}`} checked={feita} onChange={(e) => alternar(t.id, e.target.checked)} />
                      <div>
                        <label className="t" htmlFor={`t-${t.id}`}>
                          {t.titulo}
                        </label>
                        <div className="n">{t.nota}</div>
                      </div>
                      <div className="meta">
                        <span className="mins">{t.minutos} min</span>
                        <Link className="btn btn-ghost btn-sm" to={CAMINHO[t.tela]}>
                          Abrir
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {roteiro.incluidas.length > 0 && roteiro.incluidas.every((t) => feitas[t.id]) && roteiro.ficaram === 0 ? (
              <p className="route-foot">Tudo feito por hoje.</p>
            ) : (
              <p className="route-foot">{rodapeRoteiro(roteiro)}</p>
            )}
          </div>

          <RegistroDeTempo userId={perfil?.user_id} />
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h2>Datas que movem vendas</h2>
            </div>
            {datas.length === 0 ? (
              <p className="small muted">Nenhuma data cadastrada daqui para frente.</p>
            ) : (
              <ul className="peaks">
                {datas.map((d) => (
                  <li key={`${d.tipo}-${d.data}`}>
                    <span className="d">{diaPonto(d.data)}</span>
                    <span>
                      <span className="w">{d.nome}</span>
                      <br />
                      <span className="x">
                        {maiuscula(dataPorExtenso(d.data))}.{d.descricao ? ` ${d.descricao}` : ''}
                      </span>
                    </span>
                    <span className="c">{emDiasTexto(d.emDias)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>O que a equipe fez</h2>
              <p>Desde a meia-noite</p>
            </div>
            {carregandoFeed ? (
              <p className="carregando">Carregando...</p>
            ) : feed.length === 0 ? (
              <p className="small muted">{pausaGeral ? 'Os agentes estão pausados.' : 'Os agentes ainda não rodaram hoje.'}</p>
            ) : (
              <ul className="feed">
                {feed.map((a) => {
                  const ag = AGENTES.find((x) => x.id === a.agente);
                  const rosto = ROSTO[a.agente as IdAgente] ?? { icone: 'spark' as NomeIcone, av: 'av-p' };
                  return (
                    <li key={a.id}>
                      <span className={`av ${rosto.av}`}>
                        <Icone nome={rosto.icone} />
                      </span>
                      <div>
                        <div className="who">
                          {ag?.nome ?? a.agente}
                          <span className="num">{horaLocal(new Date(a.criado_em))}</span>
                        </div>
                        <p>{a.link ? <Link to={a.link}>{a.texto}</Link> : a.texto}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Seus números</h2>
            <p>Vêm do relatório oficial do painel de afiliados. Nada é estimado.</p>
          </div>
          <Link className="btn btn-ghost btn-sm" to="/resultados">
            Ver resultados
            <Icone nome="arrow" />
          </Link>
        </div>
        <div className="kpis">
          <div className="kpi">
            <span className="k">Comissão do mês (bruta)</span>
            <span className="v">—</span>
            <span className="s">aguardando dados</span>
          </div>
          <div className="kpi">
            <span className="k">Comissão por hora</span>
            <span className="v">—</span>
            <span className="s">
              {horasMes > 0 ? `aguardando dados; ${horasMes.toFixed(1).replace('.', ',')} h de operação registradas no mês` : 'a partir do 1º registro de tempo'}
            </span>
          </div>
          <div className="kpi">
            <span className="k">Seguidores</span>
            <span className="v">—</span>
            <span className="s">aguardando dados; WhatsApp e Telegram somados</span>
          </div>
          <div className="kpi">
            <span className="k">Taxa de saída semanal</span>
            <span className="v">—</span>
            <span className="s">aguardando dados; limite: 3% por semana</span>
          </div>
        </div>
      </div>
    </section>
  );
}
