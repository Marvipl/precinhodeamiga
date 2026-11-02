// Moldura do painel (seção 4.1): barra lateral no computador, cabeçalho com abas roláveis no celular.
import { Suspense } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { ABAS } from '@/app/rotas';
import { useAuth } from '@/lib/auth';
import { modoLocal } from '@/lib/supabase';
import { dataLocal } from '@core/formato.ts';
import { ok, useConsulta } from '@/lib/dados';
import { Icone } from './Icone';
import { Equipe } from './Equipe';
import { useRegistrarAtividade } from '@/lib/atividade';

function usePendentesHoje(): number {
  const { data = 0 } = useConsulta<number>(
    ['ofertas', 'pendentes', dataLocal()],
    async (sb) => {
      const r = await sb.from('ofertas').select('id', { count: 'exact', head: true }).eq('data', dataLocal()).eq('estado', 'pendente');
      ok(r);
      return r.count ?? 0;
    },
    0,
    { refetchInterval: 60_000 },
  );
  return data;
}

export function Layout() {
  const { perfil, sair } = useAuth();
  const pendentes = usePendentesHoje();
  useRegistrarAtividade(perfil?.user_id);
  const { pathname } = useLocation();
  return (
    <div className="app">
      <aside className="side">
        <Link className="brand" to="/" aria-label="Precinho de Amiga, início">
          <img src="/logo.png" alt="Precinho de Amiga" width="520" height="208" />
        </Link>
        <div className="topo">
          <Link className="icon-btn" to="/configuracoes" aria-label="Configurações" aria-current={pathname === '/configuracoes' ? 'page' : undefined}>
            <Icone nome="gear" />
          </Link>
        </div>
        <nav className="nav" aria-label="Seções">
          {ABAS.map((a) => (
            <NavLink key={a.caminho} to={a.caminho} end={a.caminho === '/'}>
              <Icone nome={a.icone} />
              {a.rotulo}
              {a.caminho === '/ofertas' && pendentes > 0 ? (
                <span className="badge" aria-label={`${pendentes} para aprovar`}>
                  {pendentes}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <Equipe />
        <div className="side-foot">
          <span>{perfil?.nome}</span>
          <Link className="icon-btn" to="/configuracoes" aria-label="Configurações" aria-current={pathname === '/configuracoes' ? 'page' : undefined}>
            <Icone nome="gear" />
          </Link>
          {!modoLocal ? (
            <button className="icon-btn" onClick={() => void sair()} aria-label="Sair">
              <Icone nome="sair" />
            </button>
          ) : null}
        </div>
      </aside>
      <main className="main" id="conteudo">
        {modoLocal ? (
          <div className="aviso" role="note">
            <Icone nome="info" />
            <span>Modo local: o Supabase ainda não está configurado. As telas mostram os estados vazios até os dados chegarem.</span>
          </div>
        ) : null}
        <Suspense fallback={<p className="carregando">Carregando...</p>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
