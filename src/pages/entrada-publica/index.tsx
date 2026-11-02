// F-20: página de entrada pública `/entrar?o=<origem>` (fora do login).
// Conta o clique por origem (sem IP nem cookie) e oferece seguir no WhatsApp ou no Telegram.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { urlEntradaClique } from './url';

type Canais = { whatsapp: boolean; telegram: boolean };

export default function EntradaPublica() {
  const [params] = useSearchParams();
  const o = params.get('o');
  const indisponivel = params.get('indisponivel') === '1';
  const base = urlEntradaClique();
  const [canais, setCanais] = useState<Canais | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    document.title = 'Precinho de Amiga';
    if (!base) return;
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(anon ? { apikey: anon, authorization: `Bearer ${anon}` } : {}) },
      body: JSON.stringify({ o }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Canais) => setCanais({ whatsapp: !!d.whatsapp, telegram: !!d.telegram }))
      .catch(() => setFalhou(true));
  }, [base, o]);

  const href = (b: 'wa' | 'tg') => `${base}?b=${b}${o ? `&o=${encodeURIComponent(o)}` : ''}`;
  const carregando = !!base && !canais && !falhou;
  const nenhum = !base || (canais && !canais.whatsapp && !canais.telegram);

  return (
    <main className="login entrada-publica">
      <span className="brand">
        <img src="/logo.png" alt="Precinho de Amiga" width="520" height="208" />
      </span>
      <div className="card">
        <div className="calc">
          <h1 className="entrada-frase">Achados que eu mesma compraria, com desconto de verdade.</h1>
          <p className="muted">Escolha onde quer receber. É só seguir o canal, sem grupo e sem spam.</p>
          {indisponivel ? (
            <p className="aviso" role="status">Esse canal ainda não está disponível. Tente o outro ou volte mais tarde.</p>
          ) : null}
          {carregando ? <p className="carregando">Carregando...</p> : null}
          {nenhum ? (
            <p className="aviso" role="status">Os canais ainda estão sendo preparados. Volte em breve.</p>
          ) : null}
          {falhou ? (
            <>
              <a className="btn btn-primary entrada-botao" href={href('wa')}>Seguir no WhatsApp</a>
              <a className="btn btn-ghost entrada-botao" href={href('tg')}>Seguir no Telegram</a>
            </>
          ) : canais ? (
            <>
              {canais.whatsapp ? <a className="btn btn-primary entrada-botao" href={href('wa')}>Seguir no WhatsApp</a> : null}
              {canais.telegram ? <a className="btn btn-ghost entrada-botao" href={href('tg')}>Seguir no Telegram</a> : null}
            </>
          ) : null}
        </div>
      </div>
      <p className="small muted entrada-privacidade">
        Privacidade: esta página conta só quantas pessoas chegaram por este link e qual botão tocaram. Não guardamos seu IP, seu
        número nem cookies de identificação. As ofertas dos canais têm link com comissão: a Precinho de Amiga ganha uma parte
        quando você compra, sem custo a mais para você.
      </p>
    </main>
  );
}
