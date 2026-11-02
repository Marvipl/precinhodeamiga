import { describe, expect, it } from 'vitest';
import { dataCurta, dataLocal, dataPorExtenso, diasEntre, instanteLocal, horaLocal, porcento, reais, somarDias } from './formato.ts';
import { CONFIG, camposDoPapel, resolverConfig } from './config.ts';
import { decidirResposta, montarPayload, podeDisparar, LIMITE_PAYLOAD, aoExpirar } from './jobs.ts';
import { AGENTES, ROTINAS } from './agentes.ts';

describe('formato', () => {
  it('reais no formato brasileiro', () => {
    expect(reais(1621)).toBe('R$ 1.621,00');
    expect(reais(7.37)).toBe('R$ 7,37');
  });
  it('porcento', () => {
    expect(porcento(0.03)).toBe('3%');
  });
  it('datas por extenso (seção 5.16)', () => {
    expect(dataPorExtenso('2026-12-02')).toBe('quarta, 2 de dezembro');
    expect(dataPorExtenso('2026-11-02')).toBe('segunda, 2 de novembro');
    expect(dataCurta('2026-12-02')).toBe('2/12');
  });
  it('fuso de Brasília', () => {
    expect(dataLocal(new Date('2026-11-03T02:30:00Z'))).toBe('2026-11-02');
    expect(instanteLocal('2026-11-02', '20:00').toISOString()).toBe('2026-11-02T23:00:00.000Z');
    expect(horaLocal(new Date('2026-11-02T23:40:00Z'))).toBe('20:40');
  });
  it('aritmética de datas', () => {
    expect(somarDias('2026-11-02', 29)).toBe('2026-12-01');
    expect(somarDias('2026-11-02', 89)).toBe('2027-01-30');
    expect(diasEntre('2026-11-02', '2027-01-31')).toBe(90);
  });
});

describe('config', () => {
  it('usa padrão e sobrescreve com o salvo', () => {
    const c = resolverConfig([{ chave: 'regras.cadencia_inicial', valor: 5 }]);
    expect(c.cadenciaInicial).toBe(5);
    expect(c.historicoCurtoDias).toBe(7);
  });
  it('operadora não vê campos só do dono', () => {
    expect(camposDoPapel('operadora').some((c) => c.soDono)).toBe(false);
    expect(camposDoPapel('dono').length).toBe(Object.keys(CONFIG).length);
  });
  it('chaves são únicas', () => {
    const chaves = Object.values(CONFIG).map((c) => c.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});

describe('agentes', () => {
  it('oito agentes e seis rotinas', () => {
    expect(AGENTES).toHaveLength(8);
    expect(Object.keys(ROTINAS)).toHaveLength(6);
  });
  it('teto total perto de 50 por dia (seção 8)', () => {
    const total = Object.values(ROTINAS).reduce((s, r) => s + r.tetoDiario, 0);
    expect(total).toBeLessThanOrEqual(60);
  });
});

describe('regras dos jobs', () => {
  it('podeDisparar', () => {
    expect(podeDisparar({ pausaGeral: true, rotinaPausada: false, usoHoje: 0, tetoDiario: null, rotina: 'pa-radar' })).toEqual({ ok: false, motivo: 'pausa_geral' });
    expect(podeDisparar({ pausaGeral: false, rotinaPausada: false, usoHoje: 1, tetoDiario: null, rotina: 'pa-radar' })).toEqual({ ok: false, motivo: 'teto_atingido' });
    expect(podeDisparar({ pausaGeral: false, rotinaPausada: false, usoHoje: 1, tetoDiario: 2, rotina: 'pa-radar' })).toEqual({ ok: true });
  });
  it('payload grande leva só job_id e nonce', () => {
    const grande = { x: 'a'.repeat(LIMITE_PAYLOAD) };
    const r = montarPayload({ job: { id: 'j', contrato: 'c/v1', entrada: grande }, nonce: 'n', urlRetorno: 'r', urlLeitura: 'l' });
    expect(r.reduzido).toBe(true);
    expect(JSON.parse(r.texto)).toEqual({ contrato: 'c/v1', job_id: 'j', nonce: 'n', retorno: 'r', leitura: 'l' });
  });
  it('decidirResposta', () => {
    expect(decidirResposta({ status: 200, tentativas: 1 })).toEqual({ estado: 'disparado' });
    expect(decidirResposta({ status: 429, retryAfter: '30', tentativas: 1 })).toMatchObject({ estado: 'pendente', esperarMs: 30_000 });
    expect(decidirResposta({ status: 500, tentativas: 2 })).toMatchObject({ estado: 'pendente', esperarMs: 120_000 });
    expect(decidirResposta({ status: 500, tentativas: 3 })).toMatchObject({ estado: 'erro' });
    expect(decidirResposta({ status: 404, tentativas: 1 })).toMatchObject({ estado: 'erro' });
  });
  it('curadoria retenta ao expirar', () => {
    expect(aoExpirar('pa-curadoria')).toBe('pendente');
    expect(aoExpirar('pa-redacao')).toBe('expirado');
  });
});
