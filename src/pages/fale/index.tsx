// Formulário público "Fale com a Precinho" (seção 4.3, F-25, F-26). Fora do login.
// Também atende o link de exclusão (/fale?apagar=<código>), seção 7.2.
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formularioFale } from '@core/atendente/formulario.ts';
import { AVISO_PRIVACIDADE_FORMULARIO } from '@core/atendente/privacidade.ts';

// Lista de opções do formulário (rádios e consentimento) com alvo de toque de 44 px.
const ESTILO_OPCOES = `.opcoes-fale{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}.opcoes-fale label{display:grid;grid-template-columns:20px minmax(0,1fr);gap:10px;align-items:center;min-height:44px;font-size:14px;cursor:pointer}.opcoes-fale input{width:18px;height:18px;margin:0;accent-color:var(--primary)}`;

async function chamar(corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!supabase) throw new Error('O formulário ainda não está no ar. Tente mais tarde.');
  const { data, error } = await supabase.functions.invoke('fale', { body: corpo });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const det = ctx ? ((await ctx.json().catch(() => null)) as { erro?: string } | null) : null;
    throw new Error(det?.erro ?? 'Não deu para enviar agora. Tente de novo em alguns minutos.');
  }
  return data as Record<string, unknown>;
}

export default function Fale() {
  const [params] = useSearchParams();
  const apagar = params.get('apagar');
  return (
    <main className="login" style={{ maxWidth: 560 }}>
      <style>{ESTILO_OPCOES}</style>
      <span className="brand">
        <img src="/logo.png" alt="Precinho de Amiga" width="520" height="208" />
      </span>
      {apagar ? <Apagar token={apagar} /> : <Formulario />}
    </main>
  );
}

function Formulario() {
  const [texto, setTexto] = useState('');
  const [preco, setPreco] = useState('');
  const [nome, setNome] = useState('');
  const [preferencia, setPreferencia] = useState<'canal' | 'whatsapp'>('canal');
  const [whatsapp, setWhatsapp] = useState('');
  const [consentimento, setConsentimento] = useState(false);
  const [site, setSite] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<{ respostas: string[]; token?: string } | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const precoNum = preco.trim() ? Number(preco.replace(/\./g, '').replace(',', '.')) : null;
    const corpo = {
      texto,
      preco_max: precoNum != null && Number.isFinite(precoNum) ? precoNum : null,
      primeiro_nome: nome.trim() || null,
      preferencia,
      whatsapp: preferencia === 'whatsapp' ? whatsapp : null,
      consentimento_whatsapp: preferencia === 'whatsapp' ? consentimento : undefined,
      site,
    };
    const v = formularioFale.safeParse(corpo);
    if (!v.success) {
      setErro(v.error.issues[0]?.message ?? 'Confira os campos.');
      return;
    }
    setEnviando(true);
    try {
      const r = await chamar(v.data);
      setFeito({ respostas: (r.respostas as string[]) ?? [], token: r.token_exclusao as string | undefined });
    } catch (x) {
      setErro(x instanceof Error ? x.message : 'Não deu para enviar.');
    } finally {
      setEnviando(false);
    }
  }

  if (feito) {
    const linkApagar = feito.token ? `${window.location.origin}/fale?apagar=${encodeURIComponent(feito.token)}` : null;
    return (
      <div className="card">
        <div className="calc">
          <h2>Recebido, obrigada!</h2>
          {feito.respostas.length ? feito.respostas.map((r, i) => <p key={i}>{r}</p>) : <p>A Lana responde no próximo bloco de revisão.</p>}
          <p className="small muted">
            {preferencia === 'whatsapp'
              ? 'A resposta chega pelo WhatsApp da Lana, no número que você informou.'
              : 'A resposta sai no canal, como "achado a pedido", sem o seu nome.'}
          </p>
          {linkApagar ? (
            <p className="small muted">
              Guarde este link para apagar seus dados quando quiser: <a href={linkApagar}>{linkApagar}</a>
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <form className="calc" onSubmit={enviar} noValidate>
        <h2>Fale com a Precinho</h2>
        <p className="muted">Conte o que você procura ou a sua dúvida. A assistente da Precinho responde o que der, e a Lana responde o resto.</p>
        <div className="field">
          <label htmlFor="texto">O que você procura ou a sua dúvida</label>
          <textarea id="texto" className="input" rows={4} maxLength={1000} required value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="preco">Até quanto quer pagar (opcional)</label>
          <input id="preco" className="input" inputMode="decimal" placeholder="Ex.: 100" value={preco} onChange={(e) => setPreco(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="nome">Seu primeiro nome (opcional)</label>
          <input id="nome" className="input" maxLength={40} autoComplete="given-name" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small muted" style={{ fontWeight: 800, marginBottom: 6 }}>
            Como prefere receber a resposta
          </legend>
          <ul className="opcoes-fale">
            <li>
              <label>
                <input type="radio" name="pref" checked={preferencia === 'canal'} onChange={() => setPreferencia('canal')} />
                <span>Pelo canal, como "achado a pedido" (sem o seu nome)</span>
              </label>
            </li>
            <li>
              <label>
                <input type="radio" name="pref" checked={preferencia === 'whatsapp'} onChange={() => setPreferencia('whatsapp')} />
                <span>Pelo WhatsApp</span>
              </label>
            </li>
          </ul>
        </fieldset>
        {preferencia === 'whatsapp' ? (
          <>
            <div className="field">
              <label htmlFor="whats">Seu WhatsApp com DDD</label>
              <input id="whats" className="input" inputMode="tel" autoComplete="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
            </div>
            <ul className="opcoes-fale">
              <li>
                <label>
                  <input type="checkbox" checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} />
                  <span>Autorizo a Precinho de Amiga a me responder por WhatsApp neste número, só sobre esta mensagem.</span>
                </label>
              </li>
            </ul>
          </>
        ) : null}
        {/* Campo isca para robôs: escondido de pessoas e de leitores de tela. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
          <label htmlFor="site">Site</label>
          <input id="site" tabIndex={-1} autoComplete="off" value={site} onChange={(e) => setSite(e.target.value)} />
        </div>
        <p className="small muted">{AVISO_PRIVACIDADE_FORMULARIO}</p>
        {erro ? (
          <p className="aviso erro" role="alert">
            {erro}
          </p>
        ) : null}
        <button className="btn btn-primary" type="submit" disabled={enviando}>
          {enviando ? 'Enviando...' : 'Enviar'}
        </button>
      </form>
    </div>
  );
}

function Apagar({ token }: { token: string }) {
  const [estado, setEstado] = useState<'pergunta' | 'apagando' | 'feito' | 'erro'>('pergunta');
  const [erro, setErro] = useState('');
  async function confirmar() {
    setEstado('apagando');
    try {
      await chamar({ acao: 'apagar', token });
      setEstado('feito');
    } catch (x) {
      setErro(x instanceof Error ? x.message : 'Não deu certo.');
      setEstado('erro');
    }
  }
  return (
    <div className="card">
      <div className="calc">
        <h2>Apagar meus dados</h2>
        {estado === 'feito' ? (
          <p>Pronto. Suas mensagens, pedidos e contato foram apagados.</p>
        ) : (
          <>
            <p className="muted">Isto apaga suas mensagens, pedidos e contato da Precinho de Amiga. Não tem volta.</p>
            {estado === 'erro' ? (
              <p className="aviso erro" role="alert">
                {erro}
              </p>
            ) : null}
            <button className="btn btn-primary" type="button" disabled={estado === 'apagando'} onClick={() => void confirmar()}>
              {estado === 'apagando' ? 'Apagando...' : 'Apagar meus dados'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
