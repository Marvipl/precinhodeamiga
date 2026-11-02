// Migração da Audiência (P10): funções de registro, confirmação obrigatória do print, RLS e view semanal.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const DIR = join(__dirname, '..', 'supabase', 'migrations');
const LANA = '11111111-1111-4111-8111-111111111111';
const ESTRANHO = '33333333-3333-4333-8333-333333333333';

const ESQUELETO = `
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

async function como<T>(id: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${id ? 'authenticated' : 'anon'}`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${id ?? ''}', false)`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

async function falha(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('era para falhar');
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(ESQUELETO);
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(join(DIR, f), 'utf8'));
  await db.exec(`insert into acesso_permitido (email, papel, nome) values ('operadora@exemplo.invalid', 'operadora', 'Operadora')`);
  await db.exec(`insert into auth.users (id, email) values ('${LANA}', 'operadora@exemplo.invalid'), ('${ESTRANHO}', 'estranho@exemplo.invalid')`);
}, 60_000);

describe('audiência no banco', () => {
  it('segunda_da_semana', async () => {
    const r = await db.query<{ s: string }>(`select segunda_da_semana('2026-11-22')::text as s`);
    expect(r.rows[0].s).toBe('2026-11-16');
  });

  it('Lana salva o WhatsApp do dia; salvar de novo corrige', async () => {
    await como(LANA, () => db.query('select salvar_seguidores_wa(50)'));
    await como(LANA, () => db.query('select salvar_seguidores_wa(52)'));
    const r = await db.query<{ total: number; fonte: string }>(`select total, fonte from seguidores_registros where canal = 'wa'`);
    expect(r.rows).toEqual([{ total: 52, fonte: 'digitado' }]);
  });

  it('anônimo e estranho não salvam nem leem', async () => {
    expect(await falha(como(null, () => db.query('select salvar_seguidores_wa(1)')))).toMatch(/permission|permiss/);
    expect(await falha(como(ESTRANHO, () => db.query('select salvar_seguidores_wa(1)')))).toMatch(/sem permissão/);
    const r = await como(ESTRANHO, () => db.query('select * from seguidores_registros'));
    expect(r.rows).toHaveLength(0);
  });

  it('ninguém escreve direto na tabela (só pelas funções ou pelo servidor)', async () => {
    const msg = await falha(
      como(LANA, () => db.query(`insert into seguidores_registros (canal, data, total, fonte) values ('wa', '2026-11-01', 1, 'digitado')`)),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it('Telegram só com fonte bot; print exige leitura', async () => {
    expect(await falha(db.query(`insert into seguidores_registros (canal, data, total, fonte) values ('tg', '2026-11-01', 1, 'digitado')`))).toMatch(/check/);
    expect(await falha(db.query(`insert into seguidores_registros (canal, data, total, fonte) values ('wa', '2026-11-01', 1, 'print')`))).toMatch(/check/);
  });

  it('print só vira registro depois da confirmação, e só quando a leitura terminou', async () => {
    const l = await db.query<{ id: string }>(`insert into leituras_print (print_path) values ('wa/teste-0001.png') returning id`);
    const id = l.rows[0].id;
    // ainda lendo: não confirma
    expect(await falha(como(LANA, () => db.query('select confirmar_leitura_print($1, 60)', [id])))).toMatch(/não está pronta/);
    await db.query(`update leituras_print set estado = 'lida', numero_lido = 61 where id = $1`, [id]);
    const antes = await db.query<{ total: number }>(`select total from seguidores_registros where canal = 'wa'`);
    expect(antes.rows[0].total).toBe(52); // a leitura sozinha não mexe no registro
    await como(LANA, () => db.query('select confirmar_leitura_print($1, 60)', [id])); // Lana corrige para 60
    const r = await db.query<{ total: number; fonte: string; leitura_id: string }>(`select total, fonte, leitura_id from seguidores_registros where canal = 'wa'`);
    expect(r.rows[0]).toEqual({ total: 60, fonte: 'print', leitura_id: id });
    const e = await db.query<{ estado: string; confirmado_por: string }>('select estado, confirmado_por from leituras_print where id = $1', [id]);
    expect(e.rows[0]).toEqual({ estado: 'confirmada', confirmado_por: LANA });
    expect(await falha(como(LANA, () => db.query('select confirmar_leitura_print($1, 70)', [id])))).toMatch(/não está pronta/);
  });

  it('view audiencia_semanas para o pacote de Resultados', async () => {
    await db.exec(`
      delete from seguidores_registros;
      insert into seguidores_registros (canal, data, total, fonte) values
        ('tg', '2026-11-03', 10, 'bot'), ('tg', '2026-11-08', 14, 'bot'), ('tg', '2026-11-10', 13, 'bot'),
        ('wa', '2026-11-02', 40, 'digitado'), ('wa', '2026-11-09', 38, 'digitado');
      insert into telegram_membros_eventos (tipo, ocorrido_em, update_id) values
        ('saiu', '2026-11-10T12:00:00Z', 1), ('saiu', '2026-11-11T12:00:00Z', 2), ('entrou', '2026-11-11T13:00:00Z', 3),
        ('saiu', '2026-11-09T02:00:00Z', 4); -- domingo 23h em Brasília: semana anterior
    `);
    const r = await db.query(`select canal, semana_inicio::text, seguidores_inicio, seguidores_fim, saidas from audiencia_semanas order by canal, semana_inicio`);
    expect(r.rows).toEqual([
      { canal: 'tg', semana_inicio: '2026-11-02', seguidores_inicio: 10, seguidores_fim: 14, saidas: 1 },
      { canal: 'tg', semana_inicio: '2026-11-09', seguidores_inicio: 14, seguidores_fim: 13, saidas: 2 },
      { canal: 'wa', semana_inicio: '2026-11-02', seguidores_inicio: null, seguidores_fim: 40, saidas: null },
      { canal: 'wa', semana_inicio: '2026-11-09', seguidores_inicio: 40, seguidores_fim: 38, saidas: null },
    ]);
    const lana = await como(LANA, () => db.query('select * from audiencia_semanas'));
    expect(lana.rows).toHaveLength(4);
    const estranho = await como(ESTRANHO, () => db.query('select * from audiencia_semanas'));
    expect(estranho.rows).toHaveLength(0);
  });
});
