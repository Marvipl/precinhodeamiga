// F-12: estado de cada rotina (última, próxima, erro, uso do dia contra o teto). Pausar e retomar só o Marcus.
import { ROTINAS, agente, type IdRotina } from '@core/agentes.ts';
import { AGENDA, estadoRotina, proximaExecucao, type SituacaoRotina } from '@core/painel-agentes.ts';
import { dataCurta, dataLocal, horaLocal } from '@core/formato.ts';
import { Icone } from '@/components/Icone';
import { useToast } from '@/components/Toast';
import { useEDono } from '@/lib/auth';
import { useConfig, useSalvarConfig } from '@/lib/config';
import { usePausarRotina, useRotinas, useTestarRotina, useUsoHoje } from '@/lib/agentes';

const PILL: Record<SituacaoRotina, string> = {
  ok: 'pill-ok',
  nunca: 'pill-std',
  teto: 'pill-sun',
  erro: 'pill-warn',
  pausada: 'pill-std',
  pausa_geral: 'pill-std',
};

function quando(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const dia = dataLocal(d);
  return `${dia === dataLocal() ? 'hoje' : dataCurta(dia)} às ${horaLocal(d)}`;
}

export function Rotinas() {
  const dono = useEDono();
  const toast = useToast();
  const { data: linhas = [], isLoading } = useRotinas();
  const { data: uso = {} } = useUsoHoje();
  const { data: config } = useConfig();
  const salvarConfig = useSalvarConfig();
  const pausar = usePausarRotina();
  const testar = useTestarRotina();
  const pausaGeral = Boolean(config?.pausaGeral);
  const agora = new Date();

  function alternarPausaGeral() {
    salvarConfig.mutate(
      { nome: 'pausaGeral', valor: !pausaGeral },
      { onSuccess: () => toast(pausaGeral ? 'Agentes retomados.' : 'Todos os agentes pausados.'), onError: (e) => toast(`Não foi possível: ${e.message}`) },
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Estado das rotinas agora</h2>
        {dono ? (
          <div className="acts">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() =>
                testar.mutate(undefined, {
                  onSuccess: (r) => toast(r.criado ? 'Teste enviado. O resultado aparece aqui em alguns minutos.' : 'Já existe um teste neste minuto.'),
                  onError: (e) => toast(`Teste não enviado: ${e.message}`),
                })
              }
              disabled={testar.isPending}
            >
              {testar.isPending ? 'Enviando...' : 'Testar rotina'}
            </button>
            <button className={`btn btn-sm ${pausaGeral ? 'btn-primary' : 'btn-ghost'}`} onClick={alternarPausaGeral} disabled={salvarConfig.isPending}>
              {pausaGeral ? 'Retomar todos os agentes' : 'Pausar todos os agentes'}
            </button>
          </div>
        ) : null}
      </div>
      {pausaGeral ? (
        <p className="aviso" role="status" style={{ marginBottom: 12 }}>
          <Icone nome="alert" />
          <span>Todos os agentes estão pausados. Nenhuma rotina dispara até o Marcus retomar.</span>
        </p>
      ) : null}
      {isLoading ? <p className="carregando">Carregando...</p> : null}
      {!isLoading && linhas.length === 0 ? <p className="small muted">Aguardando dados: o estado das rotinas aparece depois que o banco estiver ligado.</p> : null}
      <ul className="reqs">
        {linhas.map((l) => {
          const rotina = l.rotina as IdRotina;
          if (!ROTINAS[rotina]) return null;
          const usoHoje = uso[rotina] ?? 0;
          const e = estadoRotina({
            rotina,
            pausaGeral,
            pausada: l.pausada,
            tetoDiario: l.teto_diario,
            usoHoje,
            ultimaExecucao: l.ultima_execucao,
            ultimoErro: l.ultimo_erro,
          });
          const proxima = proximaExecucao(rotina, agora);
          return (
            <li key={rotina}>
              <div className="txt">
                <b>{ROTINAS[rotina].agentes.map((a) => agente(a).nome).join(', ')}</b> <span className={`pill ${PILL[e.situacao]}`}>{e.rotulo}</span>
                <div className="small muted">{AGENDA[rotina].descricao}.</div>
                <div className="small muted">
                  Última: {l.ultima_execucao ? quando(l.ultima_execucao) : 'ainda não rodou'}. Próxima: {proxima ? quando(proxima) : 'quando houver pedido'}.
                  {dono ? ` Uso hoje: ${usoHoje} de ${e.teto}.` : ''}
                </div>
                {l.ultimo_erro ? (
                  <div className="small rule warn">
                    Último erro{l.ultimo_erro_em ? ` (${quando(l.ultimo_erro_em)})` : ''}: {l.ultimo_erro}
                  </div>
                ) : null}
              </div>
              {dono ? (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pausar.isPending}
                  onClick={() =>
                    pausar.mutate(
                      { rotina, pausada: !l.pausada },
                      { onSuccess: () => toast(l.pausada ? 'Rotina retomada.' : 'Rotina pausada.'), onError: (er) => toast(`Não foi possível: ${er.message}`) },
                    )
                  }
                >
                  {l.pausada ? 'Retomar' : 'Pausar'}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
