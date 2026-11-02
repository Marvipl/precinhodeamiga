// Um campo das Configurações: mostra o valor vigente, edita conforme o tipo, salva ou volta ao valor inicial.
import { useEffect, useState } from 'react';
import { CONFIG, type ChaveConfig } from '@core/config.ts';
import { OPCOES_REVISAO, PESOS_NOTA, ROTULOS_PESOS, TEMAS_NIVEL2, tipoCampo, validarValorConfig } from '@core/configuracoes.ts';
import { dataPorExtenso, porcento, reais } from '@core/formato.ts';
import { Icone } from '@/components/Icone';
import { useToast } from '@/components/Toast';
import { useRestaurarConfig, useSalvarConfig } from '@/lib/config';

type Bloco = { inicio: string; fim: string; ligado: boolean };

const MOEDA = new Set<ChaveConfig>(['valorHoraReferencia', 'valorHoraParar']);

/** Valor legível para a tela. */
export function textoValor(nome: ChaveConfig, valor: unknown): string {
  switch (tipoCampo(nome)) {
    case 'data':
      return dataPorExtenso(String(valor));
    case 'bloco': {
      const b = valor as Bloco;
      return b.ligado ? `${b.inicio} às ${b.fim}` : `Desligado (${b.inicio} às ${b.fim})`;
    }
    case 'blocosRevisao':
      return OPCOES_REVISAO.find((o) => JSON.stringify(o.valor) === JSON.stringify(valor))?.rotulo ?? String(valor);
    case 'link':
      return valor ? String(valor) : 'Ainda não informado';
    case 'temas': {
      const t = valor as string[];
      return t.length ? TEMAS_NIVEL2.filter((x) => t.includes(x.id)).map((x) => x.rotulo).join(', ') : 'Nenhum (tudo vira rascunho)';
    }
    case 'fracao':
      return porcento(Number(valor));
    case 'pesos': {
      const p = valor as Record<string, number>;
      return PESOS_NOTA.map((k) => `${ROTULOS_PESOS[k]} ${p[k]}`).join(', ');
    }
    case 'numeroOuVazio':
      return valor === null ? 'A definir (não filtra)' : String(valor);
    case 'booleano':
      return valor ? 'Ligado' : 'Desligado';
    default:
      return MOEDA.has(nome) ? reais(Number(valor)) : String(valor);
  }
}

/** O rascunho em edição, no formato do formulário (frações viram porcentagem). */
function paraRascunho(nome: ChaveConfig, valor: unknown): unknown {
  const t = tipoCampo(nome);
  if (t === 'fracao') return String(Math.round(Number(valor) * 1000) / 10);
  if (t === 'numero' || t === 'artes') return String(valor);
  if (t === 'numeroOuVazio') return valor === null ? '' : String(valor);
  return valor;
}

function deRascunho(nome: ChaveConfig, r: unknown): unknown {
  if (tipoCampo(nome) === 'fracao') {
    const n = Number(String(r).replace(',', '.'));
    return Number.isFinite(n) ? n / 100 : r;
  }
  return r;
}

export function Campo({ nome, valor, editavel, salvo }: { nome: ChaveConfig; valor: unknown; editavel: boolean; salvo: boolean }) {
  const def = CONFIG[nome];
  const id = `cfg-${nome}`;
  const [rascunho, setRascunho] = useState<unknown>(() => paraRascunho(nome, valor));
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useSalvarConfig();
  const restaurar = useRestaurarConfig();
  const toast = useToast();
  const chaveValor = JSON.stringify(valor);

  useEffect(() => {
    setRascunho(paraRascunho(nome, valor));
    setErro(null);
  }, [chaveValor, nome]);

  const alterado = JSON.stringify(rascunho) !== JSON.stringify(paraRascunho(nome, valor));

  function onSalvar() {
    const v = validarValorConfig(nome, deRascunho(nome, rascunho));
    if (!v.ok) {
      setErro(v.erro);
      return;
    }
    setErro(null);
    salvar.mutate(
      { nome, valor: v.valor },
      { onSuccess: () => toast('Salvo.'), onError: (e) => setErro(`Não foi possível salvar: ${e.message}`) },
    );
  }

  function onRestaurar() {
    restaurar.mutate(nome, {
      onSuccess: () => toast('Voltou ao valor inicial.'),
      onError: (e) => setErro(`Não foi possível voltar: ${e.message}`),
    });
  }

  return (
    <li>
      <div className="txt">
        <label htmlFor={id} style={{ fontWeight: 800 }}>
          {def.rotulo}
        </label>
        {def.ajuda ? <div className="small muted">{def.ajuda}</div> : null}
        <div className="small muted">
          Vigente: {textoValor(nome, valor)}
          {salvo ? '' : ' (valor inicial)'}
        </div>
        {!editavel ? (
          <div className="small muted">
            <Icone nome="shield" /> Só o Marcus altera este campo.
          </div>
        ) : null}
      </div>
      {editavel ? (
        <div className="acts" style={{ flex: '1 1 260px' }}>
          <Editor nome={nome} id={id} rascunho={rascunho} setRascunho={setRascunho} />
          <button className="btn btn-primary btn-sm" onClick={onSalvar} disabled={salvar.isPending || !alterado}>
            {salvar.isPending ? 'Salvando...' : 'Salvar'}
          </button>
          {salvo ? (
            <button className="btn btn-ghost btn-sm" onClick={onRestaurar} disabled={restaurar.isPending}>
              Voltar ao valor inicial
            </button>
          ) : null}
          {erro ? (
            <p className="aviso erro" role="alert" style={{ flexBasis: '100%' }}>
              {erro}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Editor({ nome, id, rascunho, setRascunho }: { nome: ChaveConfig; id: string; rascunho: unknown; setRascunho: (v: unknown) => void }) {
  const tipo = tipoCampo(nome);
  switch (tipo) {
    case 'data':
      return <input id={id} className="input" type="date" value={String(rascunho)} onChange={(e) => setRascunho(e.target.value)} style={{ maxWidth: 200 }} />;
    case 'hora':
      return <input id={id} className="input" type="time" value={String(rascunho)} onChange={(e) => setRascunho(e.target.value)} style={{ maxWidth: 140 }} />;
    case 'bloco': {
      const b = rascunho as Bloco;
      return (
        <>
          <input id={id} className="input" type="time" aria-label="Início" value={b.inicio} onChange={(e) => setRascunho({ ...b, inicio: e.target.value })} style={{ maxWidth: 130 }} />
          <span className="small muted">às</span>
          <input className="input" type="time" aria-label="Fim" value={b.fim} onChange={(e) => setRascunho({ ...b, fim: e.target.value })} style={{ maxWidth: 130 }} />
          <label className="switch" style={{ marginLeft: 0 }}>
            <input type="checkbox" checked={b.ligado} onChange={(e) => setRascunho({ ...b, ligado: e.target.checked })} />
            Ligado
          </label>
        </>
      );
    }
    case 'blocosRevisao':
      return (
        <div className="seg" role="group" aria-labelledby={id}>
          {OPCOES_REVISAO.map((o) => (
            <button key={o.id} type="button" aria-pressed={JSON.stringify(o.valor) === JSON.stringify(rascunho)} onClick={() => setRascunho(o.valor)}>
              {o.rotulo}
            </button>
          ))}
        </div>
      );
    case 'artes':
      return (
        <div className="seg" role="group" aria-labelledby={id}>
          {['3', '4', '5'].map((n) => (
            <button key={n} type="button" aria-pressed={String(rascunho) === n} onClick={() => setRascunho(n)}>
              {n}
            </button>
          ))}
        </div>
      );
    case 'temas': {
      const t = rascunho as string[];
      return (
        <div className="acts" role="group" aria-labelledby={id}>
          {TEMAS_NIVEL2.map((x) => (
            <button
              key={x.id}
              type="button"
              className="chip"
              aria-pressed={t.includes(x.id)}
              onClick={() => setRascunho(t.includes(x.id) ? t.filter((y) => y !== x.id) : [...t, x.id])}
            >
              {x.rotulo}
            </button>
          ))}
        </div>
      );
    }
    case 'link':
      return (
        <input
          id={id}
          className="input"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={String(rascunho ?? '')}
          onChange={(e) => setRascunho(e.target.value)}
          style={{ flex: '1 1 220px' }}
        />
      );
    case 'pesos': {
      const p = rascunho as Record<string, number | string>;
      const soma = PESOS_NOTA.reduce((a, k) => a + (Number(p[k]) || 0), 0);
      return (
        <div className="acts" role="group" aria-labelledby={id}>
          {PESOS_NOTA.map((k) => (
            <div className="field" key={k}>
              <label htmlFor={`${id}-${k}`}>{ROTULOS_PESOS[k]}</label>
              <input
                id={`${id}-${k}`}
                type="number"
                min={0}
                max={100}
                value={String(p[k])}
                onChange={(e) => setRascunho({ ...p, [k]: e.target.value })}
                style={{ maxWidth: 90 }}
              />
            </div>
          ))}
          <span className={`small ${soma === 100 ? 'muted' : 'rule warn'}`}>Soma: {soma}</span>
        </div>
      );
    }
    case 'booleano':
      return (
        <label className="switch" style={{ marginLeft: 0 }}>
          <input id={id} type="checkbox" checked={Boolean(rascunho)} onChange={(e) => setRascunho(e.target.checked)} />
          {rascunho ? 'Ligado' : 'Desligado'}
        </label>
      );
    default:
      return (
        <span className="field">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            step="any"
            value={String(rascunho ?? '')}
            onChange={(e) => setRascunho(e.target.value)}
            placeholder={tipo === 'numeroOuVazio' ? 'A definir' : undefined}
          />
          {tipo === 'fracao' ? <span className="small muted">em %</span> : null}
        </span>
      );
  }
}
