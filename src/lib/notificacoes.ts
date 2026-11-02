// Web Push no navegador (F-15): inscrição deste aparelho e notificação de teste.
// A chave pública VAPID vem de VITE_VAPID_PUBLIC_KEY; o envio é feito pela função `notificar`.
import type { SupabaseClient } from '@supabase/supabase-js';
import { ok } from './dados';

export const CHAVE_VAPID = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || '';

export type Suporte = 'sem_chave' | 'sem_suporte' | 'instalar_ios' | 'bloqueado' | 'pronto';

export interface Ambiente {
  chave: string;
  temServiceWorker: boolean;
  temPush: boolean;
  ios: boolean;
  instalado: boolean;
  permissao: NotificationPermission | 'indisponivel';
}

/** O que a tela deve mostrar antes de oferecer "Ativar". Ordem importa: no iPhone sem instalar não existe PushManager. */
export function avaliarSuporte(a: Ambiente): Suporte {
  if (!a.chave) return 'sem_chave';
  if (a.ios && !a.instalado) return 'instalar_ios';
  if (!a.temServiceWorker || !a.temPush) return 'sem_suporte';
  if (a.permissao === 'denied') return 'bloqueado';
  return 'pronto';
}

export function ambienteAtual(): Ambiente {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const win = typeof window !== 'undefined' ? window : undefined;
  const ua = nav?.userAgent ?? '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && (nav?.maxTouchPoints ?? 0) > 1);
  const instalado =
    Boolean(win?.matchMedia?.('(display-mode: standalone)').matches) || (nav as { standalone?: boolean } | undefined)?.standalone === true;
  return {
    chave: CHAVE_VAPID,
    temServiceWorker: Boolean(nav && 'serviceWorker' in nav),
    temPush: Boolean(win && 'PushManager' in win),
    ios,
    instalado,
    permissao: win && 'Notification' in win ? Notification.permission : 'indisponivel',
  };
}

export function chaveParaBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function rotuloDispositivo(ua: string): string {
  if (/iPhone|iPad|iPod/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Computador (Windows)';
  if (/Macintosh/.test(ua)) return 'Computador (Mac)';
  return 'Outro aparelho';
}

async function registro(): Promise<ServiceWorkerRegistration> {
  const existente = await navigator.serviceWorker.getRegistration('/');
  if (existente) return existente;
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

export async function inscricaoAtual(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Pede permissão, inscreve este aparelho e guarda a inscrição (RLS: só a própria). */
export async function ativarNesteAparelho(sb: SupabaseClient, userId: string): Promise<void> {
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') throw new Error('Permissão negada. Libere as notificações nas configurações do navegador.');
  const reg = await registro();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(CHAVE_VAPID).slice().buffer as ArrayBuffer }));
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error('O navegador não devolveu as chaves da inscrição.');
  ok(
    await sb.from('push_inscricoes').upsert(
      { user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, dispositivo: rotuloDispositivo(navigator.userAgent) },
      { onConflict: 'endpoint' },
    ),
  );
}

export async function desativarNesteAparelho(sb: SupabaseClient): Promise<void> {
  const sub = await inscricaoAtual();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => false);
  ok(await sb.from('push_inscricoes').delete().eq('endpoint', endpoint));
}

/** Cria uma notificação de teste para quem está usando. Sai na próxima rodada (até 1 minuto). */
export async function enviarTeste(sb: SupabaseClient, userId: string): Promise<void> {
  ok(
    await sb.from('notificacoes').insert({
      user_id: userId,
      tipo: 'teste',
      titulo: 'Notificação de teste',
      corpo: 'Se você está lendo isto, as notificações estão funcionando.',
      link: '/configuracoes',
    }),
  );
}
