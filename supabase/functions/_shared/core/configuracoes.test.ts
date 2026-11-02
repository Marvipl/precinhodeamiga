import { describe, expect, it } from 'vitest';
import { CONFIG, type ChaveConfig } from './config.ts';
import { podeEditar, tipoCampo, validarNicho, validarValorConfig } from './configuracoes.ts';
import { estadoIntegracoes, INTEGRACOES } from './integracoes.ts';
import { estadoRotina, proximaExecucao, validarTeto, AGENDA } from './painel-agentes.ts';
import { ROTINAS } from './agentes.ts';

describe('configurações (F-14)', () => {
  it('todo campo tem tipo e o valor inicial passa na validação', () => {
    for (const nome of Object.keys(CONFIG) as ChaveConfig[]) {
      expect(tipoCampo(nome)).toBeTruthy();
      const r = validarValorConfig(nome, CONFIG[nome].padrao);
      expect(r.ok, nome).toBe(true);
    }
  });
  it('a Lana não edita campo do dono; o Marcus edita tudo', () => {
    expect(podeEditar('operadora', 'descontoRealMinimo')).toBe(false);
    expect(podeEditar('operadora', 'pausaGeral')).toBe(false);
    expect(podeEditar('operadora', 'blocoNoite')).toBe(true);
    expect(podeEditar('dono', 'descontoRealMinimo')).toBe(true);
  });
  it('blocos de horário', () => {
    expect(validarValorConfig('blocoNoite', { inicio: '20:00', fim: '23:00', ligado: true })).toEqual({ ok: true, valor: { inicio: '20:00', fim: '23:00', ligado: true } });
    expect(validarValorConfig('blocoNoite', { inicio: '23:00', fim: '20:00', ligado: true }).ok).toBe(false);
    expect(validarValorConfig('blocoNoite', { inicio: '25:00', fim: '26:00' }).ok).toBe(false);
  });
  it('blocos de revisão só nas duas opções', () => {
    expect(validarValorConfig('blocosRevisao', ['21:00']).ok).toBe(true);
    expect(validarValorConfig('blocosRevisao', ['10:00']).ok).toBe(false);
  });
  it('artes do Status de 3 a 5', () => {
    expect(validarValorConfig('artesStatusPorDia', 5)).toEqual({ ok: true, valor: 5 });
    expect(validarValorConfig('artesStatusPorDia', 6).ok).toBe(false);
    expect(validarValorConfig('artesStatusPorDia', 2).ok).toBe(false);
  });
  it('links dos canais', () => {
    expect(validarValorConfig('linkCanalTelegram', 'https://t.me/canal_de_teste').ok).toBe(true);
    expect(validarValorConfig('linkCanalTelegram', 'http://t.me/x').ok).toBe(false);
    expect(validarValorConfig('linkCanalTelegram', 'https://exemplo.com/x').ok).toBe(false);
    expect(validarValorConfig('linkCanalWhatsapp', 'https://whatsapp.com/channel/TESTE').ok).toBe(true);
    expect(validarValorConfig('linkCanalWhatsapp', '')).toEqual({ ok: true, valor: '' });
  });
  it('temas do nível 2 da Atendente', () => {
    expect(validarValorConfig('temasAutomaticos', ['prazo', 'medidas'])).toEqual({ ok: true, valor: ['medidas', 'prazo'] });
    expect(validarValorConfig('temasAutomaticos', ['cupom']).ok).toBe(false);
  });
  it('pesos da nota somam 100', () => {
    expect(validarValorConfig('pesosNota', { desconto: 40, comissao: 20, avaliacao: 20, aderencia: 10, prazo: 10 }).ok).toBe(true);
    const r = validarValorConfig('pesosNota', { desconto: 40, comissao: 25, avaliacao: 20, aderencia: 10, prazo: 10 });
    expect(r).toEqual({ ok: false, erro: 'Os pesos somam 105; precisam somar 100.' });
  });
  it('números, frações e campos opcionais', () => {
    expect(validarValorConfig('descontoRealMinimo', 0.15)).toEqual({ ok: true, valor: 0.15 });
    expect(validarValorConfig('descontoRealMinimo', 15).ok).toBe(false);
    expect(validarValorConfig('valorHoraReferencia', '7,37')).toEqual({ ok: true, valor: 7.37 });
    expect(validarValorConfig('cadenciaInicial', 0).ok).toBe(false);
    expect(validarValorConfig('lojaNotaMinima', '')).toEqual({ ok: true, valor: null });
    expect(validarValorConfig('dataInicioPlano', '2026-02-30').ok).toBe(false);
  });
  it('nichos: nome e palavras sem repetição', () => {
    expect(validarNicho(' Nicho de teste ', 'item A, item b,\nITEM A, ')).toEqual({ ok: true, nome: 'Nicho de teste', palavras: ['item A', 'item b'] });
    expect(validarNicho('x', 'a').ok).toBe(false);
    expect(validarNicho('Nicho', ' , ').ok).toBe(false);
  });
});

describe('integrações (F-14)', () => {
  it('conectada, incompleta e desconectada sem expor valor', () => {
    const presentes = new Set(['SHOPEE_AFFILIATE_APP_ID', 'SHOPEE_AFFILIATE_APP_SECRET', 'TELEGRAM_BOT_TOKEN']);
    const r = estadoIntegracoes((n) => presentes.has(n));
    expect(r.find((x) => x.id === 'shopee')).toEqual({ id: 'shopee', situacao: 'conectada', faltando: [] });
    expect(r.find((x) => x.id === 'telegram')?.situacao).toBe('incompleta');
    expect(r.find((x) => x.id === 'webpush')?.situacao).toBe('desconectada');
    expect(JSON.stringify(r)).not.toMatch(/valor/);
  });
  it('rotinas pedem ID e token de cada uma das seis', () => {
    const rot = INTEGRACOES.find((i) => i.id === 'rotinas')!;
    expect(rot.segredos).toContain('ROUTINE_CURADORIA_TOKEN');
    expect(rot.segredos).toHaveLength(1 + Object.keys(ROTINAS).length * 2);
  });
});

describe('painel dos agentes (F-12)', () => {
  const base = { rotina: 'pa-curadoria' as const, pausaGeral: false, pausada: false, tetoDiario: null, usoHoje: 0, ultimaExecucao: null, ultimoErro: null };
  it('ordem de prioridade dos estados', () => {
    expect(estadoRotina(base)).toMatchObject({ situacao: 'nunca', teto: 9 });
    expect(estadoRotina({ ...base, ultimaExecucao: '2026-11-02T08:37:00Z' }).situacao).toBe('ok');
    expect(estadoRotina({ ...base, usoHoje: 9, ultimaExecucao: 'x' }).situacao).toBe('teto');
    expect(estadoRotina({ ...base, tetoDiario: 20, usoHoje: 9, ultimaExecucao: 'x' }).situacao).toBe('ok');
    expect(estadoRotina({ ...base, ultimoErro: '401' }).situacao).toBe('erro');
    expect(estadoRotina({ ...base, pausada: true, ultimoErro: '401' }).situacao).toBe('pausada');
    expect(estadoRotina({ ...base, pausaGeral: true, pausada: true }).situacao).toBe('pausa_geral');
  });
  it('próxima execução no fuso de Brasília', () => {
    // segunda, 2/11/2026 às 05:00 em Brasília
    const agora = new Date('2026-11-02T08:00:00Z');
    expect(proximaExecucao('pa-curadoria', agora)?.toISOString()).toBe('2026-11-02T08:37:00.000Z');
    expect(proximaExecucao('pa-coach', agora)?.toISOString()).toBe('2026-11-02T09:23:00.000Z');
    expect(proximaExecucao('pa-redacao', agora)).toBeNull();
    // depois do horário de segunda, a próxima é a outra segunda
    expect(proximaExecucao('pa-radar', new Date('2026-11-02T12:00:00Z'))?.toISOString()).toBe('2026-11-09T10:07:00.000Z');
    // Atendente: 22:30 é o último ciclo; depois disso, 08:00 do dia seguinte
    expect(proximaExecucao('pa-atendente', new Date('2026-11-03T01:31:00Z'))?.toISOString()).toBe('2026-11-03T11:00:00.000Z');
    expect(AGENDA['pa-atendente'].horarios).toHaveLength(30);
  });
  it('teto diário válido', () => {
    expect(validarTeto('12')).toEqual({ ok: true, valor: 12 });
    expect(validarTeto(-1).ok).toBe(false);
    expect(validarTeto(1.5).ok).toBe(false);
  });
});
