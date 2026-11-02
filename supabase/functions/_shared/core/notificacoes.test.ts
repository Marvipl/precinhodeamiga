import { describe, expect, it } from 'vitest';
import {
  decidirEnvio,
  dentroDeRevisao,
  destinatarios,
  linkSeguro,
  payloadPush,
  proximoInicioRevisao,
  textoTelegram,
  tocaSempre,
  urgenciaPush,
} from './notificacoes.ts';

const BLOCOS = ['12:00', '21:00'];
const em = (iso: string) => new Date(iso);

describe('silêncio da seção 5.13', () => {
  it('lembrete do WhatsApp, Guardiã e nível 4 tocam a qualquer hora', () => {
    const madrugada = em('2026-11-03T03:30:00-03:00');
    for (const t of ['lembrete_wa', 'guardia_pausa', 'atendente_urgente', 'teste']) {
      expect(tocaSempre(t)).toBe(true);
      expect(decidirEnvio(t, madrugada, BLOCOS)).toEqual({ acao: 'enviar' });
    }
  });

  it('Atendente não urgente fora do bloco espera o próximo bloco de revisão', () => {
    const d = decidirEnvio('atendente_rascunho', em('2026-11-03T15:10:00-03:00'), BLOCOS);
    expect(d).toEqual({ acao: 'adiar', ate: em('2026-11-03T21:00:00-03:00') });
  });

  it('à noite, depois do último bloco, espera o primeiro bloco do dia seguinte', () => {
    const d = decidirEnvio('atendente_rascunho', em('2026-11-03T23:30:00-03:00'), BLOCOS);
    expect(d).toEqual({ acao: 'adiar', ate: em('2026-11-04T12:00:00-03:00') });
  });

  it('dentro da janela do bloco a Atendente toca', () => {
    expect(dentroDeRevisao(em('2026-11-03T21:00:00-03:00'), BLOCOS)).toBe(true);
    expect(dentroDeRevisao(em('2026-11-03T21:59:00-03:00'), BLOCOS)).toBe(true);
    expect(dentroDeRevisao(em('2026-11-03T22:00:00-03:00'), BLOCOS)).toBe(false);
    expect(decidirEnvio('atendente_rascunho', em('2026-11-03T12:30:00-03:00'), BLOCOS)).toEqual({ acao: 'enviar' });
  });

  it('só 21h como bloco', () => {
    expect(proximoInicioRevisao(em('2026-11-03T13:00:00-03:00'), ['21:00'])).toEqual(em('2026-11-03T21:00:00-03:00'));
  });

  it('sem blocos válidos não segura a notificação', () => {
    expect(decidirEnvio('atendente_rascunho', em('2026-11-03T15:00:00-03:00'), [])).toEqual({ acao: 'enviar' });
    expect(decidirEnvio('atendente_rascunho', em('2026-11-03T15:00:00-03:00'), ['25:00'])).toEqual({ acao: 'enviar' });
  });

  it('urgência do push acompanha o silêncio', () => {
    expect(urgenciaPush('lembrete_wa')).toBe('high');
    expect(urgenciaPush('atendente_rascunho')).toBe('normal');
  });
});

describe('destinatários e conteúdo', () => {
  const membros = [
    { user_id: 'u-operadora', papel: 'operadora' as const },
    { user_id: 'u-dono', papel: 'dono' as const },
  ];

  it('user_id nulo vai para todos; estranho não recebe', () => {
    expect(destinatarios(null, membros)).toHaveLength(2);
    expect(destinatarios('u-dono', membros)).toEqual([membros[1]]);
    expect(destinatarios('u-estranho', membros)).toEqual([]);
  });

  it('link só aceita caminho interno ou https', () => {
    expect(linkSeguro('/publicar')).toBe('/publicar');
    expect(linkSeguro('//mal.invalid')).toBe('/');
    expect(linkSeguro('javascript:alert(1)')).toBe('/');
    expect(linkSeguro('https://exemplo.invalid/x')).toBe('https://exemplo.invalid/x');
    expect(linkSeguro(null)).toBe('/');
  });

  it('payload do push', () => {
    const p = payloadPush({ id: 'n1', tipo: 'lembrete_wa', titulo: 'Hora de enviar', corpo: null, link: '/publicar' });
    expect(p).toEqual({ id: 'n1', titulo: 'Hora de enviar', corpo: '', link: '/publicar', tag: 'lembrete_wa:n1', urgente: false });
    expect(payloadPush({ id: 'n2', tipo: 'guardia_pausa', titulo: 't', corpo: 'c', link: null }).urgente).toBe(true);
  });

  it('texto do Telegram escapa HTML e monta o link absoluto', () => {
    const t = textoTelegram(
      { id: 'n1', tipo: 'guardia_pausa', titulo: 'Post <pausado>', corpo: 'Produto de teste A & cia', link: '/publicar' },
      'https://painel.exemplo.invalid/',
    );
    expect(t).toBe('<b>Post &lt;pausado&gt;</b>\n\nProduto de teste A &amp; cia\n\nhttps://painel.exemplo.invalid/publicar');
    expect(textoTelegram({ id: 'n', tipo: 'teste', titulo: 'T', corpo: null, link: '/' })).toBe('<b>T</b>');
  });
});
