// Lado servidor da Audiência com um cliente Supabase falso que registra as chamadas.
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { contarInscritos, tratarMembroCanal } from './telegram.ts';
import { pedirLeituraPrint } from './print.ts';
import { rotear } from '../telegram-webhook/roteador.ts';
import { TRATADORES } from '../telegram-webhook/tratadores.ts';
import { processarAnalistaPrint } from '../processadores/analista-print.ts';
import { processadoresPara } from '../processadores/index.ts';
import type { Job } from '../jobs/store.ts';

interface Chamada {
  tabela: string;
  passos: [string, unknown[]][];
}

function dbFalso(resp: (c: Chamada) => unknown = () => ({ data: null, error: null })) {
  const chamadas: Chamada[] = [];
  const cadeia = (c: Chamada): unknown =>
    new Proxy(
      {},
      {
        get(_t, k: string) {
          if (k === 'then') return (ok: (v: unknown) => void) => ok(resp(c));
          return (...args: unknown[]) => {
            c.passos.push([k, args]);
            return cadeia(c);
          };
        },
      },
    );
  const db = {
    from(tabela: string) {
      const c: Chamada = { tabela, passos: [] };
      chamadas.push(c);
      return cadeia(c);
    },
    storage: {
      from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://exemplo.invalid/assinada' }, error: null }) }),
    },
  };
  return { db: db as unknown as SupabaseClient, chamadas };
}

const upd = {
  update_id: 42,
  chat_member: { chat: { id: -1001 }, date: 1_763_300_000, old_chat_member: { status: 'left' }, new_chat_member: { status: 'member' } },
};

describe('webhook do Telegram', () => {
  it('roteia chat_member para a Audiência e grava só tipo e instante', async () => {
    const { db, chamadas } = dbFalso();
    const r = await rotear(upd, { db, env: () => '-1001' }, { chat_member: tratarMembroCanal });
    expect(r).toEqual({ tipo: 'chat_member', tratado: true });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].tabela).toBe('telegram_membros_eventos');
    const [nome, args] = chamadas[0].passos[0];
    expect(nome).toBe('upsert');
    expect(args[0]).toEqual({ tipo: 'entrou', ocorrido_em: new Date(1_763_300_000_000).toISOString(), update_id: 42 });
  });
  it('tipo sem tratador é ignorado; chat_member está registrado', async () => {
    const { db, chamadas } = dbFalso();
    expect(await rotear({ update_id: 1, edited_message: {} }, { db, env: () => undefined }, TRATADORES)).toEqual({ tipo: null, tratado: false });
    expect(chamadas).toHaveLength(0);
    expect(TRATADORES.chat_member).toBeTypeOf('function');
  });
  it('update de outro chat não grava nada', async () => {
    const { db, chamadas } = dbFalso();
    await tratarMembroCanal(upd, { db, env: () => '-2002' });
    expect(chamadas).toHaveLength(0);
  });
});

describe('contagem diária do Telegram', () => {
  it('sem token: modo simulado, nada gravado', async () => {
    const { db, chamadas } = dbFalso();
    const r = await contarInscritos({ db, token: undefined, canalId: '-1001' });
    expect(r.resultado).toBe('simulado');
    expect(chamadas).toHaveLength(0);
  });
  it('grava o total do dia (Brasília)', async () => {
    const { db, chamadas } = dbFalso();
    const fetchFalso = (async () => new Response(JSON.stringify({ ok: true, result: 37 }))) as typeof fetch;
    const r = await contarInscritos({ db, token: 'token-de-teste', canalId: '-1001', fetch: fetchFalso, agora: new Date('2026-11-17T02:50:00Z') });
    expect(r).toEqual({ resultado: 'gravado', total: 37, data: '2026-11-16' });
    expect(chamadas[0].passos[0][1][0]).toEqual({ canal: 'tg', data: '2026-11-16', total: 37, fonte: 'bot' });
  });
  it('resposta inválida do Telegram não grava', async () => {
    const { db, chamadas } = dbFalso();
    const fetchFalso = (async () => new Response(JSON.stringify({ ok: false, description: 'chat not found' }))) as typeof fetch;
    const r = await contarInscritos({ db, token: 't', canalId: '-1', fetch: fetchFalso });
    expect(r).toEqual({ resultado: 'erro', motivo: 'chat not found' });
    expect(chamadas).toHaveLength(0);
  });
});

describe('leitura de print', () => {
  const job = { id: 'j1', entrada: { leitura_id: 'l1' }, simulado: true } as unknown as Job;

  it('processador grava a leitura e nunca o registro de seguidores', async () => {
    const { db, chamadas } = dbFalso();
    await processarAnalistaPrint(db)(job, { numero: 1234, trecho: 'texto do print', confianca: 'alta' });
    expect(chamadas.map((c) => c.tabela)).toEqual(['leituras_print', 'atividades']);
    expect(chamadas[0].passos[0]).toEqual(['update', [{ numero_lido: 1234, trecho: 'texto do print', confianca: 'alta', estado: 'lida' }]]);
    expect(chamadas.some((c) => c.tabela === 'seguidores_registros')).toBe(false);
    expect(processadoresPara(db)['analista-print/v1']).toBeTypeOf('function');
  });
  it('sem número lido: estado sem_numero', async () => {
    const { db, chamadas } = dbFalso();
    await processarAnalistaPrint(db)(job, { numero: null, trecho: '', confianca: 'baixa' });
    expect((chamadas[0].passos[0][1][0] as { estado: string }).estado).toBe('sem_numero');
  });
  it('recusa caminho inválido e respeita o limite semanal', async () => {
    const { db } = dbFalso(() => ({ count: 4, data: null, error: null }));
    const store = {} as never;
    expect(await pedirLeituraPrint({ db, store, userId: 'u', printPath: '../x.png' })).toMatchObject({ ok: false, status: 400 });
    expect(await pedirLeituraPrint({ db, store, userId: 'u', printPath: 'wa/abcdefgh1234.png' })).toMatchObject({ ok: false, status: 429 });
  });
});
