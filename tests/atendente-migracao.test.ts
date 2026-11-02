// P13: tabelas da Atendente (contatos, mensagens, categorias), exclusão em cascata, prazo de guarda e RLS.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const DIR = join(__dirname, '..', 'supabase', 'migrations');
const LANA = '11111111-1111-4111-8111-111111111111';
const MARCUS = '22222222-2222-4222-8222-222222222222';

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
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  `);
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(join(DIR, f), 'utf8'));
  await db.exec(`insert into acesso_permitido (email, papel, nome) values ('operadora@exemplo.invalid', 'operadora', 'Operadora'), ('dono@exemplo.invalid', 'dono', 'Dono')`);
  await db.exec(`insert into auth.users (id, email) values ('${LANA}', 'operadora@exemplo.invalid'), ('${MARCUS}', 'dono@exemplo.invalid')`);
}, 60_000);

describe('Atendente: migração', () => {
  it('cria as oito categorias fechadas', async () => {
    const r = await db.query<{ n: number }>('select count(*)::int as n from atendente_categorias');
    expect(r.rows[0].n).toBe(8);
  });

  it('exclusão a pedido apaga mensagens e pedidos da pessoa em cascata', async () => {
    const c = await db.query<{ id: string }>(`insert into contatos (origem, telegram_user_id, nome_exibido) values ('telegram', 1, 'Pessoa de teste') returning id`);
    const id = c.rows[0].id;
    await db.exec(`insert into atendente_mensagens (contato_id, origem, texto) values ('${id}', 'telegram', 'mensagem de teste')`);
    await db.exec(`insert into pedidos_produto (origem, texto, contato_id) values ('bot', 'produto de teste A', '${id}')`);
    await db.exec(`delete from contatos where id = '${id}'`);
    const m = await db.query<{ n: number }>(`select count(*)::int as n from atendente_mensagens where contato_id = '${id}'`);
    const p = await db.query<{ n: number }>(`select count(*)::int as n from pedidos_produto where contato_id = '${id}'`);
    expect([m.rows[0].n, p.rows[0].n]).toEqual([0, 0]);
  });

  it('WhatsApp só com consentimento', async () => {
    await expect(db.exec(`insert into contatos (origem, whatsapp, preferencia) values ('formulario', '11900000000', 'whatsapp')`)).rejects.toThrow();
  });

  it('prazo de guarda apaga texto e dados pessoais e mantém a contagem', async () => {
    const c = await db.query<{ id: string }>(
      `insert into contatos (origem, primeiro_nome, ultima_interacao) values ('formulario', 'Pessoa de teste', now() - interval '91 days') returning id`,
    );
    const id = c.rows[0].id;
    await db.exec(`insert into atendente_mensagens (contato_id, origem, texto, rascunho) values ('${id}', 'formulario', 'texto de teste', 'rascunho de teste')`);
    const n = await db.query<{ n: number }>('select atendente_aplicar_guarda(90) as n');
    expect(n.rows[0].n).toBe(1);
    const k = await db.query<{ primeiro_nome: string | null; anonimizado_em: string | null }>(`select primeiro_nome, anonimizado_em from contatos where id = '${id}'`);
    expect(k.rows[0].primeiro_nome).toBeNull();
    expect(k.rows[0].anonimizado_em).not.toBeNull();
    const m = await db.query<{ texto: string | null; rascunho: string | null }>(`select texto, rascunho from atendente_mensagens where contato_id = '${id}'`);
    expect(m.rows).toEqual([{ texto: null, rascunho: null }]);
  });

  it('anônimo não lê contatos nem mensagens; os membros leem', async () => {
    expect((await como(null, () => db.query('select * from contatos'))).rows).toHaveLength(0);
    expect((await como(null, () => db.query('select * from atendente_mensagens'))).rows).toHaveLength(0);
    expect((await como(LANA, () => db.query('select * from contatos'))).rows.length).toBeGreaterThan(0);
    expect((await como(MARCUS, () => db.query('select * from atendente_mensagens'))).rows.length).toBeGreaterThan(0);
  });

  it('membros não escrevem mensagens direto (só as funções)', async () => {
    const c = await db.query<{ id: string }>(`select id from contatos limit 1`);
    await como(LANA, () => db.query(`update atendente_mensagens set estado = 'respondida' where contato_id = '${c.rows[0].id}'`));
    const r = await db.query<{ estado: string }>(`select estado from atendente_mensagens where contato_id = '${c.rows[0].id}'`);
    expect(r.rows[0].estado).toBe('pendente');
  });

  it('só a Lana liga e desliga respostas automáticas', async () => {
    await como(MARCUS, () => db.query(`update atendente_categorias set desligada = true where categoria = 'cupom'`));
    expect((await db.query<{ desligada: boolean }>(`select desligada from atendente_categorias where categoria = 'cupom'`)).rows[0].desligada).toBe(false);
    await como(LANA, () => db.query(`update atendente_categorias set desligada = true where categoria = 'cupom'`));
    expect((await db.query<{ desligada: boolean }>(`select desligada from atendente_categorias where categoria = 'cupom'`)).rows[0].desligada).toBe(true);
  });
});
