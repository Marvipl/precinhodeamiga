// F-01 Acesso: e-mail com link mágico, dois papéis, sessão longa (refresh automático e sessão persistida).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Papel } from '@core/config.ts';
import { supabase } from './supabase';

export interface Perfil {
  user_id: string;
  email: string;
  nome: string;
  papel: Papel;
}

interface EstadoAuth {
  carregando: boolean;
  sessao: Session | null;
  perfil: Perfil | null;
  /** Usuário entrou, mas o e-mail não está na lista de acesso. */
  semAcesso: boolean;
  entrarComEmail: (email: string) => Promise<{ erro?: string }>;
  sair: () => Promise<void>;
}

const PERFIL_LOCAL: Perfil = { user_id: 'local', email: 'local', nome: 'Modo local', papel: 'dono' };

const Ctx = createContext<EstadoAuth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(supabase !== null);
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(supabase ? null : PERFIL_LOCAL);
  const [semAcesso, setSemAcesso] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    let vivo = true;
    async function carregarPerfil(s: Session | null) {
      setSessao(s);
      if (!s) {
        setPerfil(null);
        setSemAcesso(false);
        setCarregando(false);
        return;
      }
      const { data } = await sb.from('perfis').select('user_id, email, nome, papel').eq('user_id', s.user.id).maybeSingle();
      if (!vivo) return;
      setPerfil((data as Perfil) ?? null);
      setSemAcesso(!data);
      setCarregando(false);
    }
    sb.auth.getSession().then(({ data }) => carregarPerfil(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_ev, s) => {
      void carregarPerfil(s);
    });
    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const valor: EstadoAuth = {
    carregando,
    sessao,
    perfil,
    semAcesso,
    async entrarComEmail(email) {
      if (!supabase) return { erro: 'Supabase não configurado' };
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
      });
      if (error) return { erro: 'Não foi possível enviar o link. Confira o e-mail e tente de novo.' };
      return {};
    },
    async sair() {
      await supabase?.auth.signOut();
    },
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth(): EstadoAuth {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}

export function useEDono(): boolean {
  return useAuth().perfil?.papel === 'dono';
}
