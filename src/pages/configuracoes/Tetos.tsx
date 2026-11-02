// F-14: tetos de uso dos agentes por rotina (só o Marcus). Vazio = valor inicial do código.
import { useEffect, useState } from 'react';
import { ROTINAS, agente, type IdRotina } from '@core/agentes.ts';
import { validarTeto } from '@core/painel-agentes.ts';
import { useToast } from '@/components/Toast';
import { useRotinas, useSalvarTeto, type LinhaRotina } from '@/lib/agentes';

export function Tetos() {
  const { data = [] } = useRotinas();
  return (
    <div className="card">
      <div className="card-head">
        <h2>Tetos de uso dos agentes</h2>
        <p>Máximo de disparos por dia de cada rotina. Ao atingir, a rotina espera o dia seguinte.</p>
      </div>
      <ul className="reqs">
        {(Object.keys(ROTINAS) as IdRotina[]).map((r) => (
          <LinhaTeto key={r} rotina={r} linha={data.find((l) => l.rotina === r)} />
        ))}
      </ul>
    </div>
  );
}

function LinhaTeto({ rotina, linha }: { rotina: IdRotina; linha?: LinhaRotina }) {
  const padrao = ROTINAS[rotina].tetoDiario;
  const atual = linha?.teto_diario ?? null;
  const [valor, setValor] = useState(String(atual ?? padrao));
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useSalvarTeto();
  const toast = useToast();
  useEffect(() => setValor(String(atual ?? padrao)), [atual, padrao]);
  const id = `teto-${rotina}`;

  function onSalvar() {
    const v = validarTeto(valor);
    if (!v.ok) return setErro(v.erro);
    setErro(null);
    salvar.mutate({ rotina, teto: v.valor }, { onSuccess: () => toast('Teto salvo.'), onError: (e) => setErro(`Não foi possível salvar: ${e.message}`) });
  }

  return (
    <li>
      <div className="txt">
        <label htmlFor={id} style={{ fontWeight: 800 }}>
          {rotina}
        </label>
        <div className="small muted">
          {ROTINAS[rotina].agentes.map((a) => agente(a).nome).join(', ')}. Valor inicial: {padrao}
          {atual === null ? ' (em uso)' : ''}.
        </div>
      </div>
      <div className="acts">
        <span className="field">
          <input id={id} type="number" min={0} max={100} step={1} value={valor} onChange={(e) => setValor(e.target.value)} style={{ maxWidth: 100 }} />
        </span>
        <button className="btn btn-primary btn-sm" onClick={onSalvar} disabled={salvar.isPending || !linha || valor === String(atual ?? padrao)}>
          Salvar
        </button>
        {atual !== null ? (
          <button className="btn btn-ghost btn-sm" onClick={() => salvar.mutate({ rotina, teto: null }, { onSuccess: () => toast('Voltou ao valor inicial.') })}>
            Voltar ao valor inicial
          </button>
        ) : null}
        {erro ? (
          <p className="aviso erro" role="alert" style={{ flexBasis: '100%' }}>
            {erro}
          </p>
        ) : null}
      </div>
    </li>
  );
}
