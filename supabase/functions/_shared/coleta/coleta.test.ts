import { describe, expect, it } from 'vitest';
import { coletar, criarJobCuradoria, montarEntradaCuradoria } from './servico.ts';
import { ColetaStoreMemoria } from './store-memoria.ts';
import { clienteSimulado } from '../shopee/simulado.ts';
import { JobStoreMemoria } from '../jobs/store-memoria.ts';
import { CONTRATOS } from '../core/contratos/index.ts';
import { entradaCuradoria } from '../core/curadoria/candidata.ts';
import type { ClienteShopee } from '../shopee/tipos.ts';
import { z } from 'zod';

const N1 = '00000000-0000-4000-9100-000000000001';
const N2 = '00000000-0000-4000-9100-000000000002';
const N3 = '00000000-0000-4000-9100-000000000003';

function store() {
  const s = new ColetaStoreMemoria();
  s.nichos = [
    { id: N1, nome: 'Nicho de teste A', palavras_chave: ['palavra um', 'palavra dois'], principal: true, bloqueado: false, ativo: true },
    { id: N2, nome: 'Nicho de teste B', palavras_chave: ['palavra três'], principal: false, bloqueado: false, ativo: true },
    { id: N3, nome: 'Nicho bloqueado', palavras_chave: ['palavra quatro'], principal: false, bloqueado: true, ativo: true },
  ];
  return s;
}

const dia = (d: number) => new Date(Date.UTC(2026, 10, d, 7, 47)); // 04:47 em Brasília

describe('coleta (F-02)', () => {
  it('busca as palavras dos nichos ativos, grava produtos e o preço do dia', async () => {
    const s = store();
    const r = await coletar({ store: s, cliente: clienteSimulado({ agora: () => dia(2) }), agora: dia(2) });
    expect(r).toMatchObject({ data: '2026-11-02', modo: 'simulado', palavras: 3, produtos: 24, erros: [] });
    expect(s.produtos.size).toBe(24);
    for (const p of s.produtos.values()) expect(s.precos.get(p.id)?.has('2026-11-02')).toBe(true);
    expect([...s.produtos.values()].some((p) => p.nome.includes('palavra quatro'))).toBe(false); // nicho bloqueado não é buscado
    expect(s.atividades.at(-1)?.texto).toBe('Coleta da Shopee: 24 produtos de 3 palavras-chave (modo simulado).');
  });

  it('o histórico cresce um preço por dia, sem duplicar produto', async () => {
    const s = store();
    for (const d of [2, 3, 4]) await coletar({ store: s, cliente: clienteSimulado({ agora: () => dia(d) }), agora: dia(d) });
    expect(s.produtos.size).toBe(24);
    for (const m of s.precos.values()) expect([...m.keys()]).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    // Rodar de novo no mesmo dia não cria preço extra.
    await coletar({ store: s, cliente: clienteSimulado({ agora: () => dia(4) }), agora: dia(4) });
    for (const m of s.precos.values()) expect(m.size).toBe(3);
  });

  it('erro numa palavra não derruba a coleta', async () => {
    const sim = clienteSimulado({ agora: () => dia(2) });
    const cliente: ClienteShopee = { ...sim, buscarOfertas: (b) => (b.palavraChave === 'palavra dois' ? Promise.reject(new Error('falha de teste')) : sim.buscarOfertas(b)) };
    const s = store();
    const r = await coletar({ store: s, cliente, agora: dia(2) });
    expect(r.erros).toEqual([{ palavra: 'palavra dois', erro: 'falha de teste' }]);
    expect(r.produtos).toBe(16);
  });

  it('sem palavras configuradas avisa em palavras', async () => {
    const s = new ColetaStoreMemoria();
    const r = await coletar({ store: s, cliente: clienteSimulado(), agora: dia(2) });
    expect(r.produtos).toBe(0);
    expect(s.atividades[0].texto).toMatch(/nenhuma palavra-chave configurada/);
  });

  it('palavras avulsas (pedido) buscam sem nicho', async () => {
    const s = store();
    const r = await coletar({ store: s, cliente: clienteSimulado({ agora: () => dia(2) }), agora: dia(2), palavras: ['pedido de teste'] });
    expect(r.palavras).toBe(1);
    expect([...s.produtos.values()].every((p) => p.nicho_id === null)).toBe(true);
  });
});

describe('candidatas e job diário da curadoria', () => {
  async function comHistorico(dias: number) {
    const s = store();
    for (let d = 1; d <= dias; d++) await coletar({ store: s, cliente: clienteSimulado({ agora: () => dia(d) }), agora: dia(d) });
    return s;
  }

  it('monta a entrada do contrato com até 30 candidatas e fila de 8', async () => {
    const s = await comHistorico(10);
    s.pedidos = [{ id: '00000000-0000-4000-9200-000000000001', texto: 'Pedido de teste', preco_max: 100 }];
    const agora = new Date(Date.UTC(2026, 10, 10, 8, 37));
    const { entrada, avaliados, eliminados } = await montarEntradaCuradoria({ store: s, agora });
    expect(entradaCuradoria.safeParse(entrada).success).toBe(true);
    expect(entrada.data).toBe('2026-11-10');
    expect(entrada.tamanho_fila).toBe(8);
    expect(avaliados).toBe(24);
    expect(entrada.candidatas.length).toBe(24 - eliminados);
    expect(entrada.candidatas.length).toBeLessThanOrEqual(30);
    const notas = entrada.candidatas.map((c) => c.nota);
    expect(notas).toEqual([...notas].sort((a, b) => (b ?? 0) - (a ?? 0)));
    expect(entrada.nichos.map((n) => n.nome)).toEqual(['Nicho de teste A', 'Nicho de teste B']);
    expect(entrada.pedidos).toHaveLength(1);
    // Com 10 dias de histórico nenhum alerta de histórico curto; o "de" só aparece com desconto real.
    for (const c of entrada.candidatas) {
      expect(c.historico_curto).toBe(false);
      if (c.preco_referencia !== null) expect(c.preco_atual).toBeLessThanOrEqual(c.preco_referencia * 0.9 + 0.01);
    }
  });

  it('respeita o limite de candidatas configurado', async () => {
    const s = await comHistorico(2);
    s.config = [{ chave: 'regras.candidatas_ia', valor: 5 }];
    const { entrada } = await montarEntradaCuradoria({ store: s, agora: new Date(Date.UTC(2026, 10, 2, 8, 37)) });
    expect(entrada.candidatas).toHaveLength(5);
    expect(entrada.candidatas.every((c) => c.historico_curto)).toBe(true);
  });

  it('sem o contrato curadoria/v1 registrado, não cria o job', async () => {
    const s = await comHistorico(1);
    const jobs = new JobStoreMemoria();
    const temContrato = CONTRATOS.some((c) => c.id === 'curadoria/v1');
    const r = await criarJobCuradoria({ store: s, jobs, agora: new Date(Date.UTC(2026, 10, 1, 8, 37)) });
    if (!temContrato) {
      expect(r).toMatchObject({ criado: false, motivo: 'contrato_ausente' });
      expect(jobs.jobs.size).toBe(0);
    } else {
      expect(r.criado).toBe(true);
    }
  });

  it('cria o job curadoria:<data> uma única vez', async () => {
    const s = await comHistorico(1);
    const jobs = new JobStoreMemoria();
    const registrado = CONTRATOS.some((c) => c.id === 'curadoria/v1');
    if (!registrado) {
      CONTRATOS.push({ id: 'curadoria/v1', rotina: 'pa-curadoria', descricao: 'teste', entrada: entradaCuradoria, saida: z.unknown(), simular: () => ({}) });
    }
    try {
      const agora = new Date(Date.UTC(2026, 10, 1, 8, 37));
      const r1 = await criarJobCuradoria({ store: s, jobs, agora });
      const r2 = await criarJobCuradoria({ store: s, jobs, agora });
      expect(r1.criado).toBe(true);
      expect(r2).toMatchObject({ criado: false, motivo: 'ja_existe' });
      const [job] = [...jobs.jobs.values()];
      expect(job).toMatchObject({ rotina: 'pa-curadoria', contrato: 'curadoria/v1', chave_unica: 'curadoria:2026-11-01' });
    } finally {
      if (!registrado) CONTRATOS.splice(CONTRATOS.findIndex((c) => c.id === 'curadoria/v1'), 1);
    }
  });

  it('sem candidatas, registra a atividade e não cria job', async () => {
    const s = new ColetaStoreMemoria();
    const r = await criarJobCuradoria({ store: s, jobs: new JobStoreMemoria(), agora: dia(2) });
    expect(r).toMatchObject({ criado: false, motivo: 'sem_candidatas' });
    expect(s.atividades[0].texto).toMatch(/nenhuma candidata/);
  });
});
