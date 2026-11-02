// F-01: entrar com e-mail e link mágico. Sem cadastro aberto.
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';

export default function Entrar() {
  const { entrarComEmail, semAcesso, sair } = useAuth();
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const r = await entrarComEmail(email);
    setEnviando(false);
    if (r.erro) setErro(r.erro);
    else setEnviado(true);
  }

  return (
    <main className="login">
      <span className="brand">
        <img src="/logo.png" alt="Precinho de Amiga" width="520" height="208" />
      </span>
      <div className="card">
        {semAcesso ? (
          <div className="calc">
            <h2>Este e-mail não tem acesso</h2>
            <p className="muted">O painel é só da Lana e do Marcus. Se for um engano, peça ao Marcus para liberar o seu e-mail.</p>
            <button className="btn btn-ghost" onClick={() => void sair()}>Usar outro e-mail</button>
          </div>
        ) : enviado ? (
          <div className="calc">
            <h2>Confira seu e-mail</h2>
            <p className="muted">Mandamos um link para {email}. Toque nele neste aparelho e você entra direto. Depois disso o painel lembra de você.</p>
            <button className="btn btn-ghost" onClick={() => setEnviado(false)}>Mandar de novo</button>
          </div>
        ) : (
          <form className="calc" onSubmit={enviar}>
            <h2>Entrar no painel</h2>
            <div className="field">
              <label htmlFor="email">Seu e-mail</label>
              <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {erro ? <p className="aviso erro" role="alert">{erro}</p> : null}
            <button className="btn btn-primary" type="submit" disabled={enviando}>
              {enviando ? 'Enviando...' : 'Receber link de acesso'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
