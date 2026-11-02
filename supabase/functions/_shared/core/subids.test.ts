import { describe, expect, it } from 'vitest';
import { listaSubIds, montarSubIds } from './subids.ts';

describe('subIDs (seção 5.5) e regra 5.1 item 4', () => {
  it('monta sub1..sub4 para wa, tg e at', () => {
    const s = montarSubIds({ destino: 'tg', postId: '0000-abcd', dataBloco: '2026-11-09', origem: 'rodada' });
    expect(s).toEqual({ sub1: 'tg', sub2: '0000abcd', sub3: '20261109', sub4: 'rodada' });
    expect(listaSubIds(s)).toEqual(['tg', '0000abcd', '20261109', 'rodada']);
    expect(montarSubIds({ destino: 'at', postId: 'r1', dataBloco: '2026-11-09', origem: 'pedido', livre: 'x' }).sub5).toBe('x');
  });
  it('Status, Radar ou qualquer outro destino nunca ganham link de oferta', () => {
    for (const d of ['status', 'radar', 'wa-status', '']) {
      expect(() => montarSubIds({ destino: d, postId: 'p', dataBloco: '2026-11-09', origem: 'rodada' })).toThrow(/destino sem link de oferta/);
    }
  });
  it('recusa subID com caractere especial', () => {
    expect(() => montarSubIds({ destino: 'wa', postId: 'a b', dataBloco: '2026-11-09', origem: 'rodada' })).toThrow(/sub2/);
  });
});
