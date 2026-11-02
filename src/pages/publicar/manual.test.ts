import { describe, expect, it } from 'vitest';
import { FORM_VAZIO, lerReais, validarPostManual } from './manual';

const BASE = { ...FORM_VAZIO, link_afiliado: 'https://exemplo.invalid/link-de-teste', titulo: 'Produto de teste A', preco_atual: '39,90' };

describe('post manual (F-16)', () => {
  it('lê valores em reais', () => {
    expect(lerReais('39,90')).toBe(39.9);
    expect(lerReais('1.299,00')).toBe(1299);
    expect(lerReais('R$ 12')).toBe(12);
    expect(lerReais('12.5')).toBe(12.5);
    expect(lerReais('')).toBeNull();
    expect(lerReais('abc')).toBeNull();
    expect(lerReais('1,234')).toBeNull();
  });

  it('monta o corpo da chamada post-manual', () => {
    const r = validarPostManual({ ...BASE, cupom: ' CUPOMTESTE ', frase: ' Frase de teste ' }, { fraseMax: 140 });
    expect(r).toEqual({
      ok: true,
      corpo: {
        link_afiliado: 'https://exemplo.invalid/link-de-teste',
        titulo: 'Produto de teste A',
        preco_atual: 39.9,
        preco_referencia: null,
        cupom: 'CUPOMTESTE',
        prazo: null,
        frase: 'Frase de teste',
        canais: ['wa', 'tg'],
      },
    });
  });

  it('prazo em horário de Brasília', () => {
    const r = validarPostManual({ ...BASE, prazo_data: '2999-01-01', prazo_hora: '10:00' }, { fraseMax: 140 });
    expect(r.ok && r.corpo.prazo).toBe('2999-01-01T13:00:00.000Z');
  });

  it('recusa campos inválidos', () => {
    const r = validarPostManual(
      { ...FORM_VAZIO, link_afiliado: 'http://x', preco_atual: '0', preco_referencia: 'abc', frase: 'x'.repeat(141), canais: [], prazo_data: '2000-01-01' },
      { fraseMax: 140 },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.erros).sort()).toEqual(['canais', 'frase', 'link_afiliado', 'prazo_data', 'preco_atual', 'preco_referencia', 'titulo'].sort());
    }
  });

  it('"de" precisa ser maior que o atual', () => {
    const r = validarPostManual({ ...BASE, preco_referencia: '30' }, { fraseMax: 140 });
    expect(r.ok).toBe(false);
    const ok = validarPostManual({ ...BASE, preco_referencia: '59,90' }, { fraseMax: 140 });
    expect(ok.ok && ok.corpo.preco_referencia).toBe(59.9);
  });
});
