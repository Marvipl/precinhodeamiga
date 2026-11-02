// Último uso da sessão de trabalho aberta (seção 5.15): grava no máximo a cada 5 minutos,
// quando a pessoa toca ou digita no painel. O fechamento automático usa esse instante.
import { useEffect, useRef } from 'react';
import { deveRegistrarAtividade } from '@core/tempo.ts';
import { supabase } from './supabase';

export function useRegistrarAtividade(userId: string | undefined) {
  const ultimo = useRef<number | null>(null);
  useEffect(() => {
    if (!supabase || !userId) return;
    const sb = supabase;
    const registrar = () => {
      const agora = Date.now();
      if (!deveRegistrarAtividade(ultimo.current, agora)) return;
      ultimo.current = agora;
      void sb
        .from('sessoes_trabalho')
        .update({ ultima_atividade: new Date(agora).toISOString() })
        .eq('user_id', userId)
        .is('fim', null)
        .then(() => undefined);
    };
    const eventos = ['pointerdown', 'keydown'] as const;
    eventos.forEach((e) => window.addEventListener(e, registrar, { passive: true }));
    return () => eventos.forEach((e) => window.removeEventListener(e, registrar));
  }, [userId]);
}
