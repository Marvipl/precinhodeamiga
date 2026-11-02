// Aplica todas as migrações num Postgres em memória (PGlite) com um esqueleto do schema `auth`
// do Supabase, e confere acesso (F-01) e RLS. Não substitui o Supabase local, mas pega erro de SQL cedo.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const DIR = join(__dirname, '..', 'supabase', 'migrations');

const ESQUELETO_SUPABASE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

let db: PGlite;

async function comoUsuario<T>(id: string | null, fn: () => Promise<T>): Promise<T> {
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
  await db.exec(ESQUELETO_SUPABASE);
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(join(DIR, f), 'utf8'));
    } catch (e) {
      throw new Error(`migração ${f} falhou: ${(e as Error).message}`);
    }
  }
}, 60_000);

describe('migrações', () => {
  it('criam as tabelas principais com RLS ligado', async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' order by relname`,
    );
    expect(r.rows.length).toBeGreaterThan(15);
    const semRls = r.rows.filter((x) => !x.relrowsecurity).map((x) => x.relname);
    expect(semRls).toEqual([]);
  });

  it('só e-mails permitidos ganham perfil (F-01)', async () => {
    await db.exec(`insert into acesso_permitido (email, papel, nome) values ('operadora@exemplo.invalid', 'operadora', 'Operadora'), ('dono@exemplo.invalid', 'dono', 'Dono')`);
    await db.exec(`insert into auth.users (id, email) values
      ('11111111-1111-4111-8111-111111111111', 'Operadora@exemplo.invalid'),
      ('22222222-2222-4222-8222-222222222222', 'dono@exemplo.invalid'),
      ('33333333-3333-4333-8333-333333333333', 'estranho@exemplo.invalid')`);
    const r = await db.query<{ email: string; papel: string }>('select email, papel from perfis order by email');
    expect(r.rows).toEqual([
      { email: 'dono@exemplo.invalid', papel: 'dono' },
      { email: 'operadora@exemplo.invalid', papel: 'operadora' },
    ]);
  });

  it('anônimo e estranho não leem dados internos', async () => {
    await db.exec(`insert into nichos (nome) values ('[nicho de teste]')`);
    const anon = await comoUsuario(null, () => db.query('select * from nichos'));
    expect(anon.rows).toHaveLength(0);
    const estranho = await comoUsuario('33333333-3333-4333-8333-333333333333', () => db.query('select * from nichos'));
    expect(estranho.rows).toHaveLength(0);
    const lana = await comoUsuario('11111111-1111-4111-8111-111111111111', () => db.query('select * from nichos'));
    expect(lana.rows).toHaveLength(1);
  });

  it('operadora não altera configuração só do dono', async () => {
    await db.exec(`insert into configuracoes (chave, valor, so_dono) values ('agentes.pausa_geral', 'false', true)`);
    await comoUsuario('11111111-1111-4111-8111-111111111111', () =>
      db.query(`update configuracoes set valor = 'true' where chave = 'agentes.pausa_geral'`),
    );
    const r = await db.query<{ valor: boolean }>(`select valor from configuracoes where chave = 'agentes.pausa_geral'`);
    expect(r.rows[0].valor).toBe(false);
    await comoUsuario('22222222-2222-4222-8222-222222222222', () =>
      db.query(`update configuracoes set valor = 'true' where chave = 'agentes.pausa_geral'`),
    );
    const r2 = await db.query<{ valor: boolean }>(`select valor from configuracoes where chave = 'agentes.pausa_geral'`);
    expect(r2.rows[0].valor).toBe(true);
  });

  it('registro dos jobs só o dono vê', async () => {
    await db.exec(`insert into agente_jobs (rotina, contrato, chave_unica) values ('pa-coach', 'ping/v1', 'ping:t')`);
    const lana = await comoUsuario('11111111-1111-4111-8111-111111111111', () => db.query('select * from agente_jobs'));
    expect(lana.rows).toHaveLength(0);
    const marcus = await comoUsuario('22222222-2222-4222-8222-222222222222', () => db.query('select * from agente_jobs'));
    expect(marcus.rows).toHaveLength(1);
  });

  it('tomar_jobs_pendentes marca como disparado e não pega duas vezes', async () => {
    const a = await db.query<{ id: string }>('select id from tomar_jobs_pendentes(10)');
    expect(a.rows).toHaveLength(1);
    const b = await db.query('select id from tomar_jobs_pendentes(10)');
    expect(b.rows).toHaveLength(0);
  });

  it('chave_unica impede job duplicado', async () => {
    await expect(db.exec(`insert into agente_jobs (rotina, contrato, chave_unica) values ('pa-coach', 'ping/v1', 'ping:t')`)).rejects.toThrow();
  });
});
