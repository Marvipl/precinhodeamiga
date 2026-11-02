// StoreNotificacoes sobre o Supabase (service_role). Usado pela função `notificar`.
import type { SupabaseClient } from '@supabase/supabase-js';
import { CONFIG } from '../core/config.ts';
import type { Membro } from '../core/notificacoes.ts';
import type { InscricaoSalva, Notificacao, StoreNotificacoes } from './despachar.ts';

function falha(op: string, e: { message: string } | null): void {
  if (e) throw new Error(`${op}: ${e.message}`);
}

export class StoreNotificacoesSupabase implements StoreNotificacoes {
  constructor(private db: SupabaseClient) {}

  async tomar(limite: number) {
    const r = await this.db.rpc('tomar_notificacoes', { limite });
    falha('tomar', r.error);
    return (r.data ?? []) as Notificacao[];
  }
  async membros() {
    const r = await this.db.from('perfis').select('user_id, papel');
    falha('membros', r.error);
    return (r.data ?? []) as Membro[];
  }
  async blocosRevisao() {
    const r = await this.db.from('configuracoes').select('valor').eq('chave', CONFIG.blocosRevisao.chave).maybeSingle();
    falha('blocosRevisao', r.error);
    const v = r.data?.valor;
    return Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as string[]) : CONFIG.blocosRevisao.padrao;
  }
  async inscricoes(userIds: string[]) {
    if (userIds.length === 0) return [];
    const r = await this.db.from('push_inscricoes').select('id, user_id, endpoint, p256dh, auth').in('user_id', userIds);
    falha('inscricoes', r.error);
    return (r.data ?? []) as InscricaoSalva[];
  }
  async removerInscricao(id: string) {
    falha('removerInscricao', (await this.db.from('push_inscricoes').delete().eq('id', id)).error);
  }
  async marcarUsoInscricao(id: string, quando: Date) {
    falha('marcarUsoInscricao', (await this.db.from('push_inscricoes').update({ ultimo_envio_em: quando.toISOString() }).eq('id', id)).error);
  }
  async concluir(id: string, resultado: unknown, quando: Date) {
    falha('concluir', (await this.db.from('notificacoes').update({ enviada_em: quando.toISOString(), resultado }).eq('id', id)).error);
  }
  async adiar(id: string, para: Date) {
    falha('adiar', (await this.db.from('notificacoes').update({ enviar_em: para.toISOString(), tentativas: 0 }).eq('id', id)).error);
  }
  async falhar(id: string, resultado: unknown, desistir: boolean, quando: Date) {
    const patch: Record<string, unknown> = { resultado };
    if (desistir) patch.falhou_em = quando.toISOString();
    falha('falhar', (await this.db.from('notificacoes').update(patch).eq('id', id)).error);
  }
}
