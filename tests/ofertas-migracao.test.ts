// P2: trava de decisão da oferta (S2), opções dos pedidos e limpeza da fila, num Postgres em memória.
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
  grant usage on schema public, auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

const LANA = '11111111-1111-4111-8111-111111111111';
const MARCUS = '22222222-2222-4222-8222-222222222222';
let db: PGlite;

async function como<T>(id: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${id}', false)`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(ESQUELETO);
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(DIR, f), 'utf8'));
  }
  await db.exec(`insert into acesso_permitido (email, papel, nome) values ('operadora@exemplo.invalid', 'operadora', 'Operadora'), ('dono@exemplo.invalid', 'dono', 'Dono')`);
  await db.exec(`insert into auth.users (id, email) values ('${LANA}', 'operadora@exemplo.invalid'), ('${MARCUS}', 'dono@exemplo.invalid')`);
  await db.exec(`insert into produtos (id, shopee_item_id, shopee_shop_id, nome, url_produto) values
    ('aaaaaaaa-0000-4000-8000-000000000001', 'item-teste-1', 'loja-teste', 'Produto de teste A', 'https://exemplo.invalid/a'),
    ('aaaaaaaa-0000-4000-8000-000000000002', 'item-teste-2', 'loja-teste', 'Produto de teste B', 'https://exemplo.invalid/b')`);
}, 60_000);

describe('ofertas (P2)', () => {
  it('o dono não aprova nem pula; a operadora sim (S2)', async () => {
    await db.exec(`insert into ofertas (id, produto_id, data, preco_atual) values
      ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', (now() at time zone 'America/Sao_Paulo')::date, 10)`);
    await expect(
      como(MARCUS, () => db.query(`update ofertas set estado = 'aprovada' where id = 'bbbbbbbb-0000-4000-8000-000000000001'`)),
    ).rejects.toThrow(/operadora/);
    await como(MARCUS, () => db.query(`update ofertas set frase = 'Frase de teste' where id = 'bbbbbbbb-0000-4000-8000-000000000001'`));
    await como(LANA, () => db.query(`update ofertas set estado = 'pulada' where id = 'bbbbbbbb-0000-4000-8000-000000000001'`));
    const r = await db.query<{ estado: string }>(`select estado from ofertas where id = 'bbbbbbbb-0000-4000-8000-000000000001'`);
    expect(r.rows[0].estado).toBe('pulada');
  });

  it('o sistema (sem login) pode marcar aprovada', async () => {
    await db.exec(`update ofertas set estado = 'aprovada' where id = 'bbbbbbbb-0000-4000-8000-000000000001'`);
    const r = await db.query<{ estado: string }>(`select estado from ofertas where id = 'bbbbbbbb-0000-4000-8000-000000000001'`);
    expect(r.rows[0].estado).toBe('aprovada');
  });

  it('opções dos pedidos: membros leem, não escrevem', async () => {
    await db.exec(`insert into pedidos_produto (id, origem, texto) values ('cccccccc-0000-4000-8000-000000000001', 'lana', 'pedido de teste')`);
    await db.exec(`insert into pedido_opcoes (pedido_id, produto_id, ordem) values ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 1)`);
    const r = await como(LANA, () => db.query('select * from pedido_opcoes'));
    expect(r.rows).toHaveLength(1);
    await expect(
      como(LANA, () => db.query(`insert into pedido_opcoes (pedido_id, produto_id, ordem) values ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', 2)`)),
    ).rejects.toThrow();
  });

  it('limpeza: prazo vencido e dia anterior expiram; redação parada volta para a fila', async () => {
    await db.exec(`insert into ofertas (id, produto_id, data, preco_atual, prazo, estado, origem) values
      ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002', (now() at time zone 'America/Sao_Paulo')::date, 10, now() - interval '1 minute', 'pendente', 'rodada'),
      ('bbbbbbbb-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000002', (now() at time zone 'America/Sao_Paulo')::date - 1, 10, null, 'pendente', 'rodada'),
      ('bbbbbbbb-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000002', (now() at time zone 'America/Sao_Paulo')::date, 10, null, 'aguardando_redacao', 'pedido')`);
    // o gatilho de atualizado_em só roda em update; a linha nova já tem atualizado_em = now()
    await db.exec(`alter table ofertas disable trigger ofertas_atualizado_em`);
    await db.exec(`update ofertas set atualizado_em = now() - interval '2 hours' where id = 'bbbbbbbb-0000-4000-8000-000000000004'`);
    await db.exec(`alter table ofertas enable trigger ofertas_atualizado_em`);
    const n = await db.query<{ n: number }>('select limpar_fila_ofertas() as n');
    expect(n.rows[0].n).toBe(3);
    const r = await db.query<{ id: string; estado: string; alertas: { tipo: string }[] }>(
      `select id, estado, alertas from ofertas where id in ('bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000004') order by id`,
    );
    expect(r.rows.map((x) => x.estado)).toEqual(['expirada', 'expirada', 'pendente']);
    expect(r.rows[2].alertas.map((a) => a.tipo)).toEqual(['sem_versao']);
  });
});
