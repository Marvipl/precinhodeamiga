// F-14: nichos e palavras-chave, com um nicho principal (usados pela coleta F-02).
import { useState, type FormEvent } from 'react';
import { validarNicho } from '@core/configuracoes.ts';
import { Vazio } from '@/components/Vazio';
import { useToast } from '@/components/Toast';
import { lista, ok, useAcao, useConsulta } from '@/lib/dados';

interface Nicho {
  id: string;
  nome: string;
  palavras_chave: string[];
  principal: boolean;
  ativo: boolean;
}

const CHAVE = ['nichos'];

function useNichos() {
  return useConsulta<Nicho[]>(
    CHAVE,
    async (sb) => lista<Nicho>(await sb.from('nichos').select('id, nome, palavras_chave, principal, ativo').order('principal', { ascending: false }).order('nome')),
    [],
  );
}

export function Nichos() {
  const { data: nichos = [], isLoading } = useNichos();
  const toast = useToast();
  const [nome, setNome] = useState('');
  const [palavras, setPalavras] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const criar = useAcao<{ nome: string; palavras: string[] }>(async (sb, n) => {
    ok(await sb.from('nichos').insert({ nome: n.nome, palavras_chave: n.palavras, principal: nichos.length === 0 }));
  }, [CHAVE]);

  function onCriar(e: FormEvent) {
    e.preventDefault();
    const v = validarNicho(nome, palavras);
    if (!v.ok) return setErro(v.erro);
    setErro(null);
    criar.mutate(
      { nome: v.nome, palavras: v.palavras },
      {
        onSuccess: () => {
          setNome('');
          setPalavras('');
          toast('Nicho adicionado.');
        },
        onError: (e2) => setErro(/duplicate|unique/i.test(e2.message) ? 'Já existe um nicho com esse nome.' : `Não foi possível salvar: ${e2.message}`),
      },
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Nichos e palavras-chave</h2>
        <p>A coleta procura ofertas por estas palavras. O nicho principal ganha prioridade; os outros entram marcados como teste.</p>
      </div>
      {isLoading ? <p className="carregando">Carregando...</p> : null}
      {!isLoading && nichos.length === 0 ? <Vazio titulo="Nenhum nicho ainda">Adicione o primeiro nicho abaixo. Ele vira o principal.</Vazio> : null}
      <ul className="reqs">
        {nichos.map((n) => (
          <LinhaNicho key={n.id} nicho={n} />
        ))}
      </ul>
      <form onSubmit={onCriar} className="acts" style={{ marginTop: 16, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: '1 1 180px' }}>
          <label htmlFor="nicho-nome">Novo nicho</label>
          <input id="nicho-nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} />
        </div>
        <div className="field" style={{ flex: '2 1 240px' }}>
          <label htmlFor="nicho-palavras">Palavras-chave (separe por vírgula)</label>
          <input id="nicho-palavras" className="input" value={palavras} onChange={(e) => setPalavras(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={criar.isPending}>
          {criar.isPending ? 'Salvando...' : 'Adicionar nicho'}
        </button>
        {erro ? (
          <p className="aviso erro" role="alert" style={{ flexBasis: '100%' }}>
            {erro}
          </p>
        ) : null}
      </form>
    </div>
  );
}

function LinhaNicho({ nicho }: { nicho: Nicho }) {
  const toast = useToast();
  const [editando, setEditando] = useState(false);
  const [palavras, setPalavras] = useState(nicho.palavras_chave.join(', '));
  const [erro, setErro] = useState<string | null>(null);
  const erroAo = (e: Error) => setErro(`Não foi possível salvar: ${e.message}`);

  const salvar = useAcao<string[]>(async (sb, p) => {
    ok(await sb.from('nichos').update({ palavras_chave: p }).eq('id', nicho.id));
  }, [CHAVE]);
  const tornarPrincipal = useAcao<void>(async (sb) => {
    // Só um principal (índice único parcial): desmarca o atual antes de marcar o novo.
    ok(await sb.from('nichos').update({ principal: false }).eq('principal', true));
    ok(await sb.from('nichos').update({ principal: true }).eq('id', nicho.id));
  }, [CHAVE]);
  const alternarAtivo = useAcao<void>(async (sb) => {
    ok(await sb.from('nichos').update({ ativo: !nicho.ativo }).eq('id', nicho.id));
  }, [CHAVE]);
  const remover = useAcao<void>(async (sb) => {
    ok(await sb.from('nichos').delete().eq('id', nicho.id));
  }, [CHAVE]);

  function onSalvar() {
    const v = validarNicho(nicho.nome, palavras);
    if (!v.ok) return setErro(v.erro);
    setErro(null);
    salvar.mutate(v.palavras, {
      onSuccess: () => {
        setEditando(false);
        toast('Palavras-chave salvas.');
      },
      onError: erroAo,
    });
  }

  return (
    <li>
      <div className="txt">
        <b>{nicho.nome}</b> {nicho.principal ? <span className="pill pill-plum">Principal</span> : null}
        {!nicho.ativo ? <span className="pill pill-std">Desligado</span> : null}
        {editando ? (
          <div className="field" style={{ marginTop: 8 }}>
            <label htmlFor={`pal-${nicho.id}`}>Palavras-chave (separe por vírgula)</label>
            <input id={`pal-${nicho.id}`} className="input" value={palavras} onChange={(e) => setPalavras(e.target.value)} />
          </div>
        ) : (
          <div className="small muted">{nicho.palavras_chave.join(', ')}</div>
        )}
        {erro ? (
          <p className="aviso erro" role="alert">
            {erro}
          </p>
        ) : null}
      </div>
      <div className="acts">
        {editando ? (
          <>
            <button className="btn btn-primary btn-sm" onClick={onSalvar} disabled={salvar.isPending}>
              Salvar
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditando(true)}>
              Editar palavras
            </button>
            {!nicho.principal ? (
              <button className="btn btn-ghost btn-sm" onClick={() => tornarPrincipal.mutate(undefined, { onSuccess: () => toast('Nicho principal trocado.'), onError: erroAo })}>
                Tornar principal
              </button>
            ) : null}
            <button className="btn btn-ghost btn-sm" onClick={() => alternarAtivo.mutate(undefined, { onError: erroAo })}>
              {nicho.ativo ? 'Desligar' : 'Ligar'}
            </button>
            {!nicho.principal ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  if (window.confirm(`Remover o nicho "${nicho.nome}"?`)) remover.mutate(undefined, { onError: erroAo });
                }}
              >
                Remover
              </button>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}
