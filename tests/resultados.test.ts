// Migração de Resultados (P11): tabelas, view para a Audiência e RLS. Dados fictícios.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { validarResumo } from '../supabase/functions/_shared/processadores/analista-resumo.ts';

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
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(join(DIR, f), 'utf8'));
  await db.exec(`insert into acesso_permitido (email, papel, nome) values ('operadora@exemplo.invalid', 'operadora', 'Operadora')`);
  await db.exec(`insert into auth.users (id, email) values ('${LANA}', 'operadora@exemplo.invalid')`);
}, 60_000);

describe('migração de Resultados', () => {
  it('membro importa conversões; anônimo não lê; view agrega sem canceladas', async () => {
    await como(LANA, async () => {
      await db.exec(`insert into conversoes (pedido_id, item_id, dia, data_pedido, status, valor_pedido, comissao, sub1, origem) values
        ('PEDIDO-TESTE-1', 'A', '2026-11-03', '2026-11-03T21:00:00-03:00', 'concluida', 100, 8, 'wa', 'csv'),
        ('PEDIDO-TESTE-2', 'B', '2026-11-03', '2026-11-03T22:00:00-03:00', 'cancelada', 50, 4, 'wa', 'csv')`);
      await db.exec(`insert into cliques_diarios (dia, sub1, cliques, origem) values ('2026-11-03', 'wa', 30, 'csv'), ('2026-11-04', 'tg', 5, 'csv')`);
    });
    expect((await como(null, () => db.query('select * from conversoes'))).rows).toHaveLength(0);
    const v = await como(LANA, () => db.query<{ dia: string; sub1: string; cliques: number; pedidos: number; comissao: string }>(`select dia::text, sub1, cliques, pedidos, comissao::text from conversoes_por_canal_dia order by dia, sub1`));
    expect(v.rows).toEqual([
      { dia: '2026-11-03', sub1: 'wa', cliques: 30, pedidos: 1, comissao: '8.00' },
      { dia: '2026-11-04', sub1: 'tg', cliques: 5, pedidos: 0, comissao: '0.00' },
    ]);
  });

  it('pedido e item não duplicam', async () => {
    await expect(
      db.exec(`insert into conversoes (pedido_id, item_id, dia, data_pedido, status, origem) values ('PEDIDO-TESTE-1', 'A', '2026-11-03', now(), 'pendente', 'csv')`),
    ).rejects.toThrow();
  });

  it('mês do pagamento no formato AAAA-MM', async () => {
    await como(LANA, () => db.exec(`insert into pagamentos_comissao (mes, valor_liquido) values ('2026-11', 10)`));
    await expect(db.exec(`insert into pagamentos_comissao (mes, valor_liquido) values ('2026-13', 10)`)).rejects.toThrow();
  });

  it('o painel não escreve resumo semanal (só o processador)', async () => {
    await expect(como(LANA, () => db.exec(`insert into resumos_semanais (semana_inicio, semana_fim, texto) values ('2026-11-02', '2026-11-08', 'x')`))).rejects.toThrow();
  });

  it('gate registra decisão uma vez por gate', async () => {
    await como(LANA, () => db.exec(`insert into gate_decisoes (gate, recomendacao, decisao) values ('dia30', 'ajustar', 'ajustar')`));
    await expect(db.exec(`insert into gate_decisoes (gate, decisao) values ('dia30', 'escalar')`)).rejects.toThrow();
  });
});

describe('processador do resumo', () => {
  const entrada = { semana_inicio: '2026-11-09', semana_fim: '2026-11-15', numeros: [{ rotulo: 'Pedidos na semana', valor: '12' }], avisos: [] };
  it('aceita texto fiel e recusa número inventado', () => {
    expect(() => validarResumo(entrada, { texto: 'Foram 12 pedidos.' })).not.toThrow();
    expect(() => validarResumo(entrada, { texto: 'Foram 13 pedidos.' })).toThrow(/13/);
  });
});
