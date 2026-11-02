import { describe, expect, it } from 'vitest';
import {
  AVISO_WHATSAPP,
  agruparPorPost,
  concluido,
  enviosCancelaveis,
  horaCurta,
  podeMarcarEnviado,
  precisaRevisar,
  resumoGuardia,
  seloGuardia,
  textoCanal,
  textoParaCopiar,
  tituloDoBloco,
  type EnvioLinha,
} from './estado';

const POST = { id: 'p1', tipo: 'oferta', titulo: 'Produto de teste A', preco_atual: 10, produto_id: 'x' };

function envio(o: Partial<EnvioLinha>): EnvioLinha {
  return {
    id: `${o.post_id ?? 'p1'}-${o.canal ?? 'wa'}`,
    post_id: 'p1',
    canal: 'wa',
    texto: '*Produto de teste A*\nPor R$ 10,00\n[link]\nLink com comissão',
    agendado_para: '2026-11-02T23:00:00.000Z', // 20:00 em Brasília
    estado: 'agendado',
    guardia: [],
    publicado_em: null,
    erro: null,
    posts: POST,
    ...o,
  };
}

describe('Publicar: leitura dos envios', () => {
  it('agrupa por post e ordena pelo horário', () => {
    const p2 = { ...POST, id: 'p2', titulo: 'Produto de teste B' };
    const r = agruparPorPost([
      envio({ post_id: 'p2', posts: p2, agendado_para: '2026-11-02T23:40:00.000Z' }),
      envio({ canal: 'tg' }),
      envio({}),
    ]);
    expect(r.map((x) => x.post.id)).toEqual(['p1', 'p2']);
    expect(r[0].wa?.canal).toBe('wa');
    expect(r[0].tg?.canal).toBe('tg');
  });

  it('estado por canal em palavras, como no mock', () => {
    expect(textoCanal(envio({ canal: 'tg' }))).toEqual({ texto: 'Agendado. Sai sozinho às 20:00', tom: 'auto' });
    expect(textoCanal(envio({ canal: 'tg', estado: 'pausado' })).texto).toBe('Pausado até você revisar');
    expect(textoCanal(envio({ canal: 'tg', estado: 'publicado', publicado_em: '2026-11-02T23:01:00.000Z' })).texto).toBe('Publicado às 20:01');
    expect(textoCanal(envio({})).texto).toBe('Você envia: copiar e colar');
    expect(textoCanal(envio({ estado: 'nao_enviado' })).texto).toBe('Não enviado no fim do bloco');
    expect(textoCanal(envio({ estado: 'enviado' })).texto).toBe('Enviado por você');
    expect(
      textoCanal(envio({ canal: 'tg', estado: 'bloqueado', guardia: [{ checagem: 'repeticao', ok: false, mensagem: 'Mesmo produto nas últimas 48 horas' }] })).texto,
    ).toBe('Não sai: Mesmo produto nas últimas 48 horas');
  });

  it('selo da Guardiã', () => {
    const [ok] = agruparPorPost([envio({}), envio({ canal: 'tg' })]);
    expect(seloGuardia(ok)).toEqual({ texto: 'Guardiã aprovou', tom: 'ok' });
    const [pausa] = agruparPorPost([envio({ estado: 'revisar_preco' }), envio({ canal: 'tg', estado: 'pausado' })]);
    expect(seloGuardia(pausa).texto).toBe('Revisar preço');
    expect(precisaRevisar(pausa)).toBe(true);
    const [bloq] = agruparPorPost([envio({ estado: 'bloqueado' })]);
    expect(seloGuardia(bloq).texto).toBe('Bloqueado pela Guardiã');
    const [canc] = agruparPorPost([envio({ estado: 'cancelado' }), envio({ canal: 'tg', estado: 'cancelado' })]);
    expect(seloGuardia(canc).texto).toBe('Cancelado');
  });

  it('copiar usa o texto do WhatsApp; marcar enviado só no WhatsApp agendado', () => {
    const [p] = agruparPorPost([envio({ canal: 'tg', texto: '<b>tg</b>' }), envio({ texto: '*wa*' })]);
    expect(textoParaCopiar(p)).toBe('*wa*');
    expect(podeMarcarEnviado(p)).toBe(true);
    const [s] = agruparPorPost([envio({ estado: 'enviado' })]);
    expect(podeMarcarEnviado(s)).toBe(false);
    const [r] = agruparPorPost([envio({ estado: 'revisar_preco' })]);
    expect(podeMarcarEnviado(r)).toBe(false);
  });

  it('cancelar mexe só no que ainda não saiu', () => {
    const [p] = agruparPorPost([envio({ canal: 'tg', estado: 'publicado' }), envio({})]);
    expect(enviosCancelaveis(p).map((e) => e.canal)).toEqual(['wa']);
    expect(concluido(p)).toBe(false);
    const [f] = agruparPorPost([envio({ canal: 'tg', estado: 'publicado' }), envio({ estado: 'enviado' })]);
    expect(enviosCancelaveis(f)).toEqual([]);
    expect(concluido(f)).toBe(true);
  });

  it('resumo da Guardiã: aviso de comissão, alertas, cadência e aviso fixo do WhatsApp', () => {
    const posts = agruparPorPost([
      envio({ canal: 'tg' }),
      envio({ guardia: [{ checagem: 'historico_curto', ok: false, mensagem: 'Histórico de preço curto: observado há 3 dias.' }] }),
    ]);
    const r = resumoGuardia(posts, 6);
    expect(r[0]).toEqual({ tom: 'ok', texto: 'Aviso "link com comissão" em todos os posts' });
    expect(r.some((i) => i.tom === 'warn' && i.texto.includes('Post das 20:00 (WhatsApp): Histórico de preço curto'))).toBe(true);
    expect(r.some((i) => i.texto.startsWith('Cadência de hoje: 1 no Telegram e 1 no WhatsApp. Limite atual: 6'))).toBe(true);
    expect(r[r.length - 1]).toEqual({ tom: 'info', texto: AVISO_WHATSAPP });
  });

  it('sem posts, sobra só o aviso fixo do WhatsApp', () => {
    expect(resumoGuardia([], 6)).toEqual([{ tom: 'info', texto: AVISO_WHATSAPP }]);
  });

  it('acusa post sem o aviso de comissão', () => {
    const r = resumoGuardia(agruparPorPost([envio({ texto: 'sem aviso' })]), 6);
    expect(r[0].tom).toBe('warn');
  });

  it('título do bloco', () => {
    expect(horaCurta('20:00')).toBe('20h');
    expect(horaCurta('12:30')).toBe('12h30');
    expect(tituloDoBloco({ noite: { inicio: '20:00', ligado: true }, almoco: { inicio: '12:00', ligado: false } })).toBe('Bloco da noite, 20h');
    expect(tituloDoBloco({ noite: { inicio: '20:00', ligado: true }, almoco: { inicio: '12:00', ligado: true } })).toBe('Blocos de hoje, 12h e 20h');
  });
});
