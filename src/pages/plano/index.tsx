// Plano de 90 dias (F-24): linha do tempo, revisão da Coach e checklists com progresso no servidor.
import { useMemo } from 'react';
import { CabecalhoTela, Vazio } from '@/components/Vazio';
import { useToast } from '@/components/Toast';
import { useEDono } from '@/lib/auth';
import { useConfig } from '@/lib/config';
import { lista, ok, useAcao, useConsulta } from '@/lib/dados';
import { dataLocal, dataPorExtenso } from '@core/formato.ts';
import {
  PERIODOS,
  TAREFAS_PLANO,
  diaDoPlano,
  estaAtrasada,
  estadoPeriodo,
  linhaDoTempo,
  quandoPeriodo,
  rotuloDia,
  tarefasFeitas,
  textoTarefa,
  type MarcaPlano,
} from '@core/coach/plano.ts';

interface Revisao {
  semana: string;
  prioridades: Array<{ tarefa_id: string; motivo: string }>;
  nota: string;
  simulado: boolean;
}

const CHAVE_MARCAS = ['plano_marcas'];
const CHAVE_REVISAO = ['plano_revisoes', 'ultima'];

export default function Pagina() {
  const toast = useToast();
  const eDono = useEDono();
  const config = useConfig();
  const inicio = String(config.data?.dataInicioPlano ?? '2026-11-02');
  const hoje = dataLocal();
  const dia = diaDoPlano(inicio, hoje);

  const marcas = useConsulta<MarcaPlano[]>(CHAVE_MARCAS, async (sb) => lista(await sb.from('plano_marcas').select('tarefa, feita')), []);
  const picos = useConsulta<Array<{ data: string; nome: string }>>(
    ['datas_pico'],
    async (sb) => lista(await sb.from('datas_pico').select('data, nome').order('data')),
    [],
  );
  const revisao = useConsulta<Revisao | null>(
    CHAVE_REVISAO,
    async (sb) =>
      ok(await sb.from('plano_revisoes').select('semana, prioridades, nota, simulado').order('semana', { ascending: false }).limit(1).maybeSingle()) as Revisao | null,
    null,
  );

  const marcar = useAcao<{ tarefa: string; feita: boolean }>(async (sb, m) => {
    ok(await sb.from('plano_marcas').upsert({ tarefa: m.tarefa, feita: m.feita, marcado_em: new Date().toISOString() }));
  }, [CHAVE_MARCAS]);

  const pedirRevisao = useAcao<void, { criado?: boolean; motivo?: string }>(async (sb) => {
    const r = await sb.functions.invoke('coach-semanal', { body: {} });
    if (r.error) throw new Error(r.error.message);
    return r.data as { criado?: boolean; motivo?: string };
  }, [CHAVE_REVISAO]);

  const feitas = useMemo(() => tarefasFeitas(marcas.data ?? []), [marcas.data]);
  const linha = useMemo(() => linhaDoTempo(inicio, picos.data ?? [], hoje), [inicio, picos.data, hoje]);
  const atual = PERIODOS.find((p) => estadoPeriodo(p, dia) === 'atual');

  const alternar = (tarefa: string, feita: boolean) =>
    marcar.mutate(
      { tarefa, feita },
      { onError: (e) => toast(`Não foi possível salvar: ${e instanceof Error ? e.message : 'erro desconhecido'}`) },
    );

  const pedir = () =>
    pedirRevisao.mutate(undefined, {
      onSuccess: (r) =>
        toast(r?.motivo === 'fora_do_plano' ? 'Fora do período do plano: sem revisão.' : r?.criado ? 'Pedido enviado à Coach.' : 'A revisão desta semana já foi pedida.'),
      onError: (e) => toast(`Não foi possível pedir: ${e instanceof Error ? e.message : 'erro desconhecido'}`),
    });

  const lead = atual
    ? `${atual.foco} Os itens marcados como "a plataforma faz" saem da sua lista.`
    : dia < 1
      ? `O plano começa em ${dataPorExtenso(inicio)}.`
      : 'Plano de 90 dias concluído.';

  const rev = revisao.data;

  return (
    <section className="view stack" aria-labelledby="h-plano">
      <CabecalhoTela eyebrow={`Coach do Plano · ${rotuloDia(inicio, hoje)}`} titulo="Plano de 90 dias" lead={lead} />

      <div className="card">
        <div className="tl" aria-label={linha.rotuloAcessivel}>
          {linha.marcas.map((m) => (
            <span
              key={`${m.rotulo}-${m.pos}`}
              className={['tl-mark', m.baixa ? 'low' : '', m.gate ? 'key' : '', m.fim ? 'end' : ''].filter(Boolean).join(' ')}
              style={{ left: `${m.pos}%` }}
            >
              {m.rotulo}
            </span>
          ))}
          <div className="tl-bar">
            {linha.fases.map((f) => (
              <div key={f.id} className={`tl-seg ${f.id}`} style={{ flex: f.dias }} title={f.legenda}>
                {f.curto}
              </div>
            ))}
          </div>
          <div className="tl-axis">
            {linha.eixo.map((e) => (
              <span key={e}>{e}</span>
            ))}
          </div>
        </div>
        <div className="tl-legend">
          {linha.fases.map((f, i) => (
            <span key={f.id}>
              <i className={`k${i + 1}`} />
              {f.legenda}
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Revisão da semana</h2>
            <p>A Coach revisa o plano toda segunda-feira e ajusta o roteiro do dia.</p>
          </div>
          {rev?.simulado ? <span className="pill pill-sun">Simulada</span> : null}
          {eDono ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={pedir} disabled={pedirRevisao.isPending}>
              Pedir revisão agora
            </button>
          ) : null}
        </div>
        {revisao.isLoading ? (
          <p className="small muted">Carregando...</p>
        ) : rev ? (
          <>
            <p className="small muted">Semana de {dataPorExtenso(rev.semana)}</p>
            <p>{rev.nota}</p>
            {rev.prioridades.length > 0 ? (
              <ol className="small">
                {rev.prioridades.map((p) => {
                  const t = TAREFAS_PLANO.find((x) => x.id === p.tarefa_id);
                  return t ? (
                    <li key={p.tarefa_id}>
                      <b>{textoTarefa(t, inicio)}</b>
                      <span className="muted"> {p.motivo}</span>
                    </li>
                  ) : null;
                })}
              </ol>
            ) : null}
          </>
        ) : (
          <Vazio titulo="Aguardando dados">A primeira revisão da Coach sai na próxima segunda-feira de manhã.</Vazio>
        )}
      </div>

      <div className="phases">
        {PERIODOS.map((p) => {
          const estado = estadoPeriodo(p, dia);
          const tarefas = TAREFAS_PLANO.filter((t) => t.periodo === p.id);
          return (
            <div key={p.id} className="card phase" aria-current={estado === 'atual' ? 'step' : undefined}>
              <div className="card-head" style={{ marginBottom: 4 }}>
                <h3>{p.titulo}</h3>
                {estado === 'atual' ? <span className="pill pill-plum">Agora</span> : null}
              </div>
              <p className="when">{quandoPeriodo(p, inicio)}</p>
              <ul className="checks">
                {tarefas.map((t) => {
                  const feita = feitas.has(t.id);
                  const atrasada = estaAtrasada(t, dia, feitas);
                  return (
                    <li key={t.id}>
                      <label style={{ minHeight: 44 }}>
                        <input type="checkbox" checked={feita} disabled={marcar.isPending} onChange={(e) => alternar(t.id, e.target.checked)} />
                        <span>
                          {textoTarefa(t, inicio)}
                          {atrasada ? (
                            <>
                              {' '}
                              <span className="pill pill-warn">Atrasada</span>
                            </>
                          ) : null}
                          <span className="by">{t.responsavel}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
