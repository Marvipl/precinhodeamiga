// P9: migração do Radar e da página de entrada no PGlite (RLS, contagem sem duplicar, limpeza, job semanal).
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { contrato } from '../supabase/functions/_shared/core/contratos/index.ts';

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

const LANA = '11111111-1111-4111-8111-111111111111';
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
  await db.exec(ESQUELETO_SUPABASE);
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(join(DIR, f), 'utf8'));
    } catch (e) {
      throw new Error(`migração ${f} falhou: ${(e as Error).message}`);
    }
  }
  await db.exec(`insert into acesso_permitido (email, papel, nome) values ('operadora@exemplo.invalid', 'operadora', 'Operadora')`);
  await db.exec(`insert into auth.users (id, email) values ('${LANA}', 'operadora@exemplo.invalid')`);
}, 60_000);

describe('Radar e página de entrada (migração P9)', () => {
  it('conta um clique por resumo e não guarda nada pessoal', async () => {
    const sal = (await db.query<{ s: string }>('select entrada_sal_do_dia() as s')).rows[0].s;
    expect(sal.length).toBeGreaterThan(30);
    expect((await db.query<{ s: string }>('select entrada_sal_do_dia() as s')).rows[0].s).toBe(sal);
    const a = await db.query<{ r: boolean }>(`select entrada_registrar('direto', 'pagina', 'resumo-1') as r`);
    const b = await db.query<{ r: boolean }>(`select entrada_registrar('direto', 'pagina', 'resumo-1') as r`);
    const c = await db.query<{ r: boolean }>(`select entrada_registrar('direto', 'wa', 'resumo-2') as r`);
    expect([a.rows[0].r, b.rows[0].r, c.rows[0].r]).toEqual([true, false, true]);
    const cols = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'entrada_cliques' order by ordinal_position`,
    );
    expect(cols.rows.map((r) => r.column_name)).toEqual(['id', 'origem', 'botao', 'criado_em']);
  });

  it('anônimo não lê cliques, sal nem resumos; a Lana lê o agregado', async () => {
    for (const t of ['entrada_cliques', 'entrada_sal', 'entrada_vistos', 'radar_lugares']) {
      const r = await como(null, () => db.query(`select * from ${t}`));
      expect(r.rows, t).toHaveLength(0);
    }
    const sal = await como(LANA, () => db.query('select * from entrada_sal'));
    expect(sal.rows).toHaveLength(0);
    const diarios = await como(LANA, () => db.query<{ origem: string; botao: string; total: number }>('select origem, botao, total from entrada_cliques_diarios order by botao'));
    expect(diarios.rows).toEqual([
      { origem: 'direto', botao: 'pagina', total: 1 },
      { origem: 'direto', botao: 'wa', total: 1 },
    ]);
  });

  it('a Lana não grava lugares direto (só pela função radar-acao)', async () => {
    await db.exec(`insert into radar_lugares (chave, nome, tipo, regra) values ('nome:t:lugar-a', 'Lugar de teste A', 'Grupo de teste', 'Regra de teste')`);
    await como(LANA, () => db.query(`update radar_lugares set estado = 'aprovado'`)).catch(() => null);
    const r = await db.query<{ estado: string }>('select estado from radar_lugares');
    expect(r.rows[0].estado).toBe('novo');
    const lidos = await como(LANA, () => db.query('select * from radar_lugares'));
    expect(lidos.rows).toHaveLength(1);
  });

  it('aprovado exige origem, dias e intervalo; regra que proíbe links não sai de novo/descartado', async () => {
    await expect(db.exec(`update radar_lugares set estado = 'aprovado'`)).rejects.toThrow();
    await db.exec(`update radar_lugares set estado = 'aprovado', origem = 'lugar-a', dias_permitidos = '{5}', intervalo_dias = 7`);
    await expect(db.exec(`update radar_lugares set origem = 'Origem Inválida'`)).rejects.toThrow();
    await db.exec(`insert into radar_lugares (chave, nome, tipo, regra, proibe_links) values ('nome:t:lugar-c', 'Grupo de teste C', 'Grupo de teste', 'proíbe links', true)`);
    await expect(db.exec(`update radar_lugares set estado = 'pedir_permissao' where chave = 'nome:t:lugar-c'`)).rejects.toThrow();
  });

  it('limpeza apaga resumos com mais de 24 horas e guarda só totais depois de 90 dias', async () => {
    await db.exec(`insert into entrada_vistos (resumo, criado_em) values ('velho', now() - interval '25 hours')`);
    await db.exec(`insert into entrada_cliques (origem, botao, criado_em) values ('lugar-a', 'pagina', now() - interval '91 days'), ('lugar-a', 'pagina', now() - interval '91 days')`);
    await db.exec('select entrada_limpar()');
    const vistos = await db.query<{ resumo: string }>('select resumo from entrada_vistos order by resumo');
    expect(vistos.rows.map((r) => r.resumo)).toEqual(['resumo-1', 'resumo-2']);
    const velhos = await db.query(`select * from entrada_cliques where criado_em < now() - interval '90 days'`);
    expect(velhos.rows).toHaveLength(0);
    const tot = await db.query<{ total: number }>(`select total from entrada_cliques_totais where origem = 'lugar-a'`);
    expect(tot.rows[0].total).toBe(2);
    const view = await db.query<{ total: number }>(`select sum(total)::int as total from entrada_cliques_diarios where origem = 'lugar-a'`);
    expect(view.rows[0].total).toBe(2);
  });

  it('job semanal do Radar sai com entrada válida para o contrato e não duplica', async () => {
    await db.exec(`insert into nichos (nome, principal) values ('[nicho de teste]', true)`);
    const id = (await db.query<{ id: string | null }>('select criar_job_radar() as id')).rows[0].id;
    expect(id).toBeTruthy();
    const de_novo = (await db.query<{ id: string | null }>('select criar_job_radar() as id')).rows[0].id;
    expect(de_novo).toBeNull();
    const job = (await db.query<{ rotina: string; contrato: string; entrada: unknown }>('select rotina, contrato, entrada from agente_jobs where id = $1', [id])).rows[0];
    expect(job.rotina).toBe('pa-radar');
    const c = contrato(job.contrato)!;
    const e = c.entrada.safeParse(job.entrada);
    expect(e.success).toBe(true);
    expect((job.entrada as { ja_vistos: string[] }).ja_vistos).toContain('nome:t:lugar-a');
    expect((job.entrada as { nichos: string[] }).nichos).toContain('[nicho de teste]');
  });
});
