// F-14: estado das integrações (só o Marcus). Diz se cada segredo existe; os valores ficam nos segredos.
import { INTEGRACOES, type SituacaoIntegracao } from '@core/integracoes.ts';
import { useIntegracoes } from '@/lib/agentes';
import { modoLocal } from '@/lib/supabase';

const PILL: Record<SituacaoIntegracao, [string, string]> = {
  conectada: ['pill-ok', 'Conectada'],
  incompleta: ['pill-sun', 'Incompleta'],
  desconectada: ['pill-warn', 'Desconectada'],
};

export function Integracoes() {
  const { data, isLoading, error } = useIntegracoes(!modoLocal);
  return (
    <div className="card">
      <div className="card-head">
        <h2>Integrações</h2>
        <p>As chaves ficam nos segredos do Supabase, nunca nesta tela. Aqui aparece só se cada uma existe.</p>
      </div>
      {data ? (
        <p className="small muted" style={{ marginBottom: 12 }}>
          Agentes em modo {data.modoAgentes === 'real' ? 'real' : 'simulado (respostas fictícias)'}.
        </p>
      ) : null}
      {error ? (
        <p className="aviso erro" role="alert">
          Não foi possível consultar as integrações: {(error as Error).message}
        </p>
      ) : null}
      <ul className="reqs">
        {INTEGRACOES.map((i) => {
          const e = data?.integracoes.find((x) => x.id === i.id);
          const [classe, rotulo] = e ? PILL[e.situacao] : ['pill-std', isLoading ? 'Consultando' : 'Aguardando dados'];
          return (
            <li key={i.id}>
              <div className="txt">
                <b>{i.nome}</b>
                <div className="small muted">{i.serve}</div>
                {e && e.situacao !== 'conectada' ? (
                  <div className="small muted">
                    {i.semSegredo} Falta: {e.faltando.join(', ')}.
                  </div>
                ) : null}
              </div>
              <span className={`pill ${classe}`}>{rotulo}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
