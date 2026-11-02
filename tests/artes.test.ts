// P4: migração das artes. Aplica todas as migrações num PGlite com esqueletos de `auth` e `storage`
// e confere o bucket privado, a política de leitura e a unicidade (data, oferta).
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const DIR = join(__dirname, '..', 'supabase', 'migrations');

const ESQUELETO = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant all on all tables in schema storage to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

let db: PGlite;

async function como<T>(id: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${id ? 'authenticated' : 'anon'}`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${id ?? ''}', false)`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(ESQUELETO);
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(join(DIR, f), 'utf8'));
    } catch (e) {
      throw new Error(`migração ${f} falhou: ${(e as Error).message}`);
    }
  }
  await db.exec(`insert into acesso_permitido (email, papel, nome) values ('operadora@exemplo.invalid', 'operadora', 'Operadora')`);
  await db.exec(`insert into auth.users (id, email) values
    ('11111111-1111-4111-8111-111111111111', 'operadora@exemplo.invalid'),
    ('33333333-3333-4333-8333-333333333333', 'estranho@exemplo.invalid')`);
  await db.exec(`insert into storage.objects (bucket_id, name) values ('artes', 'status/2026-11-02/teste.svg')`);
}, 60_000);

describe('artes (P4)', () => {
  it('cria o bucket privado `artes`', async () => {
    const r = await db.query<{ public: boolean }>(`select public from storage.buckets where id = 'artes'`);
    expect(r.rows).toEqual([{ public: false }]);
  });

  it('só membros leem as artes no Storage', async () => {
    const membro = await como('11111111-1111-4111-8111-111111111111', () => db.query('select name from storage.objects'));
    expect(membro.rows).toHaveLength(1);
    const estranho = await como('33333333-3333-4333-8333-333333333333', () => db.query('select name from storage.objects'));
    expect(estranho.rows).toHaveLength(0);
    const anon = await como(null, () => db.query('select name from storage.objects'));
    expect(anon.rows).toHaveLength(0);
  });

  it('uma arte por oferta por dia', async () => {
    await db.exec(`insert into nichos (nome) values ('[nicho de teste]')`);
    await db.exec(`insert into produtos (id, shopee_item_id, shopee_shop_id, nome, url_produto)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '1', '1', 'Produto de teste A', 'https://exemplo.invalid/p')`);
    await db.exec(`insert into ofertas (id, produto_id, data, preco_atual)
      values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-11-02', 10)`);
    await db.exec(`insert into artes_status (data, oferta_id, legenda) values ('2026-11-02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Legenda de teste')`);
    await expect(
      db.exec(`insert into artes_status (data, oferta_id, legenda) values ('2026-11-02', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Outra')`),
    ).rejects.toThrow();
  });
});
