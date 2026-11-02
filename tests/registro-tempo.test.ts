// P5: registro de tempo no banco (F-11, seção 5.15). Mesmo esqueleto do Supabase de migracoes.test.ts.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const DIR = join(__dirname, '..', 'supabase', 'migrations');
const LANA = '11111111-1111-4111-8111-111111111111';
const MARCUS = '22222222-2222-4222-8222-222222222222';

let db: PGlite;

async function comoUsuario<T>(id: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${id}', false)`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
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
  `);
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(DIR, f), 'utf8'));
  }
  await db.exec(`insert into acesso_permitido (email, papel, nome) values ('operadora@exemplo.invalid', 'operadora', 'Operadora'), ('dono@exemplo.invalid', 'dono', 'Dono')`);
  await db.exec(`insert into auth.users (id, email) values ('${LANA}', 'operadora@exemplo.invalid'), ('${MARCUS}', 'dono@exemplo.invalid')`);
}, 60_000);

describe('registro de tempo', () => {
  it('cada pessoa tem no máximo uma sessão aberta', async () => {
    await comoUsuario(LANA, () => db.query(`insert into sessoes_trabalho (user_id, inicio, ultima_atividade) values ($1, '2026-11-02T20:00:00Z', '2026-11-02T20:40:00Z')`, [LANA]));
    await expect(
      comoUsuario(LANA, () => db.query(`insert into sessoes_trabalho (user_id, inicio) values ($1, '2026-11-02T21:00:00Z')`, [LANA])),
    ).rejects.toThrow();
  });

  it('ninguém mexe na sessão do outro', async () => {
    await comoUsuario(MARCUS, () => db.query(`update sessoes_trabalho set montagem = true where user_id = $1`, [LANA]));
    const r = await db.query<{ montagem: boolean }>(`select montagem from sessoes_trabalho where user_id = $1`, [LANA]);
    expect(r.rows[0].montagem).toBe(false);
    const leitura = await comoUsuario(MARCUS, () => db.query(`select * from sessoes_trabalho`));
    expect(leitura.rows).toHaveLength(1);
  });

  it('usuários do painel não chamam o fechamento direto', async () => {
    await expect(comoUsuario(LANA, () => db.query(`select fechar_sessoes_inativas()`))).rejects.toThrow();
  });

  it('fecha a sessão inativa no último uso e pede confirmação', async () => {
    const antes = await db.query<{ n: number }>(`select fechar_sessoes_inativas('2026-11-02T22:39:00Z') as n`);
    expect(antes.rows[0].n).toBe(0);
    const depois = await db.query<{ n: number }>(`select fechar_sessoes_inativas('2026-11-02T22:40:00Z') as n`);
    expect(depois.rows[0].n).toBe(1);
    const r = await db.query<{ fim: Date; fechada_automaticamente: boolean; confirmada_em: Date | null }>(
      `select fim, fechada_automaticamente, confirmada_em from sessoes_trabalho where user_id = $1`,
      [LANA],
    );
    expect(r.rows[0].fim.toISOString()).toBe('2026-11-02T20:40:00.000Z');
    expect(r.rows[0].fechada_automaticamente).toBe(true);
    expect(r.rows[0].confirmada_em).toBeNull();
  });

  it('respeita as horas configuradas', async () => {
    await db.exec(`insert into configuracoes (chave, valor, so_dono) values ('regras.sessao_inativa_horas', '1', true)`);
    await db.query(`insert into sessoes_trabalho (user_id, inicio) values ($1, '2026-11-03T10:00:00Z')`, [MARCUS]);
    const r = await db.query<{ n: number }>(`select fechar_sessoes_inativas('2026-11-03T11:00:00Z') as n`);
    expect(r.rows[0].n).toBe(1);
  });
});
