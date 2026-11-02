// Migração do P7 (F-15): tomada atômica e política do teste. Mesmo esqueleto do Supabase de migracoes.test.ts.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const DIR = join(__dirname, '..', 'supabase', 'migrations');
const ESQUELETO = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;
const LANA = '11111111-1111-4111-8111-111111111111';
let db: PGlite;

async function como<T>(id: string, fn: () => Promise<T>): Promise<T> {
  await db.exec('set role authenticated');
  await db.exec(`select set_config('request.jwt.claim.sub', '${id}', false)`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(ESQUELETO);
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(join(DIR, f), 'utf8'));
  await db.exec(`insert into acesso_permitido (email, papel, nome) values ('operadora@exemplo.invalid', 'operadora', 'Operadora')`);
  await db.exec(`insert into auth.users (id, email) values ('${LANA}', 'operadora@exemplo.invalid')`);
}, 60_000);

describe('notificações (P7)', () => {
  it('tomar_notificacoes pega só as vencidas, conta a tentativa e não pega duas vezes', async () => {
    await db.exec(`insert into notificacoes (tipo, titulo, enviar_em) values
      ('lembrete_wa', 'Vencida', now() - interval '1 minute'),
      ('lembrete_wa', 'Futura', now() + interval '1 hour')`);
    const a = await db.query<{ titulo: string; tentativas: number }>('select titulo, tentativas from tomar_notificacoes(10)');
    expect(a.rows).toEqual([{ titulo: 'Vencida', tentativas: 1 }]);
    const b = await db.query('select * from tomar_notificacoes(10)');
    expect(b.rows).toHaveLength(0);
  });

  it('membro cria só o próprio teste', async () => {
    await como(LANA, () => db.query(`insert into notificacoes (user_id, tipo, titulo) values ('${LANA}', 'teste', 'Notificação de teste')`));
    await expect(
      como(LANA, () => db.query(`insert into notificacoes (user_id, tipo, titulo) values ('${LANA}', 'lembrete_wa', 'Falso')`)),
    ).rejects.toThrow();
    await expect(como(LANA, () => db.query(`insert into notificacoes (user_id, tipo, titulo) values (null, 'teste', 'Para todos')`))).rejects.toThrow();
  });

  it('a operadora não chama a tomada do despachante', async () => {
    await expect(como(LANA, () => db.query('select * from tomar_notificacoes(10)'))).rejects.toThrow();
  });
});
