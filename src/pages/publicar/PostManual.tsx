import { useState, type FormEvent } from 'react';
import { useToast } from '@/components/Toast';
import { modoLocal } from '@/lib/supabase';
import type { Canal } from './estado';
import { FORM_VAZIO, validarPostManual, type FormPostManual } from './manual';
import { useCriarPostManual } from './dados';

type Erros = Partial<Record<keyof FormPostManual, string>>;

/** F-16: plano B quando a API da Shopee ou os agentes estão fora do ar. Mesmo caminho do post normal. */
export function PostManual({ data, fraseMax }: { data: string; fraseMax: number }) {
  const toast = useToast();
  const criar = useCriarPostManual(data);
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState<FormPostManual>(FORM_VAZIO);
  const [erros, setErros] = useState<Erros>({});

  const campo = (k: keyof FormPostManual) => ({
    id: `pm-${k}`,
    className: 'input',
    value: f[k] as string,
    onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }),
    'aria-invalid': erros[k] ? true : undefined,
    'aria-describedby': erros[k] ? `pm-${k}-erro` : undefined,
  });
  const erro = (k: keyof FormPostManual) =>
    erros[k] ? (
      <span className="erro" id={`pm-${k}-erro`}>
        {erros[k]}
      </span>
    ) : null;

  function alternarCanal(c: Canal) {
    setF({ ...f, canais: f.canais.includes(c) ? f.canais.filter((x) => x !== c) : [...f.canais, c] });
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    const r = validarPostManual(f, { fraseMax });
    if (!r.ok) {
      setErros(r.erros);
      return;
    }
    setErros({});
    criar.mutate(r.corpo, {
      onSuccess: () => {
        setF(FORM_VAZIO);
        setAberto(false);
        toast('Post manual criado. Passou pela Guardiã e entrou no bloco.');
      },
      onError: (err) => toast(`Não foi possível criar o post: ${err.message}`),
    });
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Post manual</h2>
          <p>Para quando a Shopee ou os agentes estiverem fora do ar</p>
        </div>
        {!aberto ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAberto(true)} disabled={modoLocal}>
            Criar post manual
          </button>
        ) : null}
      </div>
      {modoLocal ? <p className="muted small">Disponível quando o painel estiver ligado ao banco.</p> : null}
      {aberto ? (
        <form className="pm-form" onSubmit={enviar} noValidate>
          <div className="field full">
            <label htmlFor="pm-link_afiliado">Link de afiliado</label>
            <input {...campo('link_afiliado')} type="url" inputMode="url" placeholder="Cole o link que você gerou no painel de afiliados" />
            <small>Gere um link por canal no painel da Shopee, se quiser medir cada um. A Guardiã confere o link antes de sair.</small>
            {erro('link_afiliado')}
          </div>
          <div className="field full">
            <label htmlFor="pm-titulo">Nome do produto</label>
            <input {...campo('titulo')} maxLength={120} />
            {erro('titulo')}
          </div>
          <div className="field">
            <label htmlFor="pm-preco_atual">Preço atual (R$)</label>
            <input {...campo('preco_atual')} inputMode="decimal" placeholder="39,90" />
            {erro('preco_atual')}
          </div>
          <div className="field">
            <label htmlFor="pm-preco_referencia">Preço "de" (opcional)</label>
            <input {...campo('preco_referencia')} inputMode="decimal" />
            <small>Só aparece se houver histórico e não passar do maior preço observado.</small>
            {erro('preco_referencia')}
          </div>
          <div className="field">
            <label htmlFor="pm-cupom">Cupom (opcional)</label>
            <input {...campo('cupom')} maxLength={40} />
            {erro('cupom')}
          </div>
          <div className="field">
            <label htmlFor="pm-prazo_data">Oferta válida até (opcional)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input {...campo('prazo_data')} type="date" aria-label="Dia do prazo" />
              <input {...campo('prazo_hora')} id="pm-prazo_hora" type="time" aria-label="Hora do prazo" />
            </div>
            {erro('prazo_data')}
          </div>
          <div className="field full">
            <label htmlFor="pm-frase">Por que vale a pena (opcional)</label>
            <textarea {...campo('frase')} maxLength={fraseMax} />
            <small>
              {f.frase.trim().length} de {fraseMax} caracteres. Sem frase, o post sai sem ela.
            </small>
            {erro('frase')}
          </div>
          <div className="field full">
            <span className="small" style={{ fontWeight: 800, color: 'var(--muted)' }}>
              Canais
            </span>
            <div className="pm-canais">
              <label>
                <input type="checkbox" checked={f.canais.includes('tg')} onChange={() => alternarCanal('tg')} />
                Telegram (sai sozinho)
              </label>
              <label>
                <input type="checkbox" checked={f.canais.includes('wa')} onChange={() => alternarCanal('wa')} />
                WhatsApp (você envia)
              </label>
            </div>
            {erro('canais')}
          </div>
          <div className="post-actions full">
            <button type="submit" className="btn btn-primary" disabled={criar.isPending}>
              {criar.isPending ? 'Criando...' : 'Criar e agendar'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setAberto(false);
                setErros({});
              }}
            >
              Fechar
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
