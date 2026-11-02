import { describe, expect, it } from 'vitest';
import { acoesPermitidas, chaveLugar, estadoFinal, grupoDoEstado, totais, transicionar, validarAprovacao, AVISO_PROIBE_LINKS } from './lugares.ts';
import { diasPorExtenso, marcarMisturadas, podeDivulgarHoje, proximaVezPermitida, sugerirDivulgacao } from './agenda.ts';
import { completarSeguidores, contemLink, gerarOrigem, lerBotao, linkEntrada, montarConvite, resolverOrigem, resumoAcesso, ipDoPedido } from './entrada.ts';
import { contrato } from '../contratos/index.ts';
import type { EntradaRadar } from '../contratos/radar.ts';

describe('Radar: estados dos lugares (5.11)', () => {
  const l = (estado: Parameters<typeof transicionar>[0]['estado'], proibe_links = false) => ({ estado, proibe_links });

  it('segue o caminho novo -> pedir permissão -> aguardando -> aprovado', () => {
    expect(transicionar(l('novo'), 'adicionar')).toEqual({ ok: true, estado: 'pedir_permissao' });
    expect(transicionar(l('pedir_permissao'), 'ja_pedi')).toEqual({ ok: true, estado: 'aguardando' });
    expect(transicionar(l('aguardando'), 'aprovou', { dias_permitidos: [5], intervalo_dias: 7 })).toEqual({ ok: true, estado: 'aprovado' });
    expect(transicionar(l('aguardando'), 'recusou')).toEqual({ ok: true, estado: 'recusou' });
  });

  it('aprovar exige dias permitidos e intervalo', () => {
    expect(transicionar(l('aguardando'), 'aprovou').ok).toBe(false);
    expect(validarAprovacao({ dias_permitidos: [], intervalo_dias: 7 })).toMatch(/dia/);
    expect(validarAprovacao({ dias_permitidos: [7], intervalo_dias: 7 })).toMatch(/inválido/);
    expect(validarAprovacao({ dias_permitidos: [1, 1], intervalo_dias: 7 })).toMatch(/repetido/);
    expect(validarAprovacao({ dias_permitidos: [1], intervalo_dias: 0 })).toMatch(/intervalo/);
    expect(validarAprovacao({ dias_permitidos: [1, 5], intervalo_dias: 14 })).toBeNull();
  });

  it('recusou e descartado não voltam (item 5)', () => {
    expect(estadoFinal('recusou')).toBe(true);
    expect(estadoFinal('descartado')).toBe(true);
    expect(acoesPermitidas(l('recusou'))).toEqual([]);
    expect(acoesPermitidas(l('descartado'))).toEqual([]);
    expect(transicionar(l('recusou'), 'adicionar').ok).toBe(false);
  });

  it('regra que proíbe links só permite descartar (item 6)', () => {
    expect(acoesPermitidas(l('novo', true))).toEqual(['descartar']);
    expect(transicionar(l('novo', true), 'adicionar')).toEqual({ ok: false, motivo: AVISO_PROIBE_LINKS });
    expect(transicionar(l('novo', true), 'descartar')).toEqual({ ok: true, estado: 'descartado' });
  });

  it('não pula etapas', () => {
    expect(transicionar(l('novo'), 'aprovou', { dias_permitidos: [1], intervalo_dias: 7 }).ok).toBe(false);
    expect(transicionar(l('pedir_permissao'), 'recusou').ok).toBe(false);
  });

  it('totais no topo e filtros', () => {
    expect(grupoDoEstado('pedir_permissao')).toBe('conversa');
    expect(grupoDoEstado('aguardando')).toBe('conversa');
    const t = totais([{ estado: 'novo' }, { estado: 'novo' }, { estado: 'aguardando' }, { estado: 'pedir_permissao' }, { estado: 'aprovado' }, { estado: 'recusou' }]);
    expect(t).toEqual({ novos: 2, em_conversa: 2, aprovados: 1 });
  });

  it('chave do lugar ignora maiúsculas, acentos, www e barra final', () => {
    expect(chaveLugar({ nome: 'X', tipo: 'Y', url: 'https://www.Exemplo.invalid/Grupo/' })).toBe('url:exemplo.invalid/grupo');
    expect(chaveLugar({ nome: 'Lugar de Teste Á', tipo: 'Grupo de teste', url: null })).toBe('nome:grupo-de-teste:lugar-de-teste-a');
  });
});

describe('Radar: agenda de divulgação (5.11 itens 3 e 8)', () => {
  // 2026-11-06 é sexta (5); 2026-11-02 é segunda (1).
  it('próxima vez permitida respeita dia e intervalo', () => {
    expect(proximaVezPermitida({ dias_permitidos: [5], intervalo_dias: 7, ultima_divulgacao: null }, '2026-11-02')).toBe('2026-11-06');
    expect(proximaVezPermitida({ dias_permitidos: [5], intervalo_dias: 7, ultima_divulgacao: '2026-11-06' }, '2026-11-06')).toBe('2026-11-13');
    expect(proximaVezPermitida({ dias_permitidos: [5], intervalo_dias: 14, ultima_divulgacao: '2026-11-06' }, '2026-11-07')).toBe('2026-11-20');
    expect(proximaVezPermitida({ dias_permitidos: [1, 5], intervalo_dias: 3, ultima_divulgacao: '2026-11-02' }, '2026-11-03')).toBe('2026-11-06');
    expect(proximaVezPermitida({ dias_permitidos: [], intervalo_dias: 3, ultima_divulgacao: null }, '2026-11-03')).toBeNull();
  });

  it('"Divulguei hoje" só no dia liberado', () => {
    const base = { estado: 'aprovado', dias_permitidos: [5], intervalo_dias: 7, ultima_divulgacao: null };
    expect(podeDivulgarHoje(base, '2026-11-06')).toEqual({ ok: true });
    const nao = podeDivulgarHoje(base, '2026-11-05');
    expect(nao.ok).toBe(false);
    if (!nao.ok) expect(nao.proxima).toBe('2026-11-06');
    expect(podeDivulgarHoje({ ...base, ultima_divulgacao: '2026-11-06' }, '2026-11-06').ok).toBe(false);
    expect(podeDivulgarHoje({ ...base, estado: 'aguardando' }, '2026-11-06').ok).toBe(false);
  });

  it('roteiro só sugere com lugar liberado e última divulgação há mais de 48 horas', () => {
    const lugares = [{ estado: 'aprovado', dias_permitidos: [5], intervalo_dias: 7, ultima_divulgacao: null }];
    const sexta = new Date('2026-11-06T13:00:00Z');
    expect(sugerirDivulgacao(lugares, null, sexta)).toBe(true);
    expect(sugerirDivulgacao(lugares, new Date('2026-11-05T13:00:00Z'), sexta)).toBe(false);
    expect(sugerirDivulgacao(lugares, new Date('2026-11-04T12:59:00Z'), sexta)).toBe(true);
    expect(sugerirDivulgacao(lugares, null, new Date('2026-11-05T13:00:00Z'))).toBe(false);
  });

  it('leituras a menos de 48 horas ficam misturadas', () => {
    const m = marcarMisturadas([
      { id: 'a', divulgado_em: '2026-11-06T12:00:00Z' },
      { id: 'b', divulgado_em: '2026-11-07T12:00:00Z' },
      { id: 'c', divulgado_em: '2026-11-12T12:00:00Z' },
    ]);
    expect([...m].sort()).toEqual(['a', 'b']);
  });

  it('dias por extenso', () => {
    expect(diasPorExtenso([5])).toBe('Sex');
    expect(diasPorExtenso([5, 1, 3])).toBe('Seg, Qua e Sex');
  });
});

describe('Página de entrada (F-20)', () => {
  it('origem desconhecida ou ausente conta como direto', () => {
    const conhecidas = new Set(['lugar-de-teste-a']);
    const ok = (o: string) => conhecidas.has(o);
    expect(resolverOrigem(null, ok)).toBe('direto');
    expect(resolverOrigem('', ok)).toBe('direto');
    expect(resolverOrigem('nao-existe', ok)).toBe('direto');
    expect(resolverOrigem('<script>', ok)).toBe('direto');
    expect(resolverOrigem('Lugar-de-Teste-A', ok)).toBe('lugar-de-teste-a');
    expect(resolverOrigem('status', ok)).toBe('status');
  });

  it('gera origem única e legível', () => {
    expect(gerarOrigem('Grupo de Teste: Ação!', new Set())).toBe('grupo-de-teste-acao');
    expect(gerarOrigem('Grupo de teste', new Set(['grupo-de-teste']))).toBe('grupo-de-teste-2');
    expect(gerarOrigem('Status', new Set())).toBe('status-2');
    expect(gerarOrigem('!!!', new Set())).toBe('lugar');
    expect(gerarOrigem('x'.repeat(80), new Set()).length).toBeLessThanOrEqual(40);
  });

  it('link de entrada', () => {
    expect(linkEntrada('https://exemplo.invalid/', 'lugar-a')).toBe('https://exemplo.invalid/entrar?o=lugar-a');
    expect(linkEntrada('https://exemplo.invalid', 'direto')).toBe('https://exemplo.invalid/entrar');
  });

  it('botões aceitos', () => {
    expect(lerBotao('wa')).toBe('wa');
    expect(lerBotao('pagina')).toBe('pagina');
    expect(lerBotao('x')).toBeNull();
    expect(lerBotao(null)).toBeNull();
  });

  it('resumo do acesso é irreversível e muda com o sal do dia', async () => {
    const p = { sal: 's1', ip: '203.0.113.9', agente: 'navegador de teste', origem: 'direto', botao: 'pagina' as const };
    const a = await resumoAcesso(p);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('203.0.113.9');
    expect(await resumoAcesso(p)).toBe(a);
    expect(await resumoAcesso({ ...p, sal: 's2' })).not.toBe(a);
    expect(await resumoAcesso({ ...p, botao: 'wa' })).not.toBe(a);
  });

  it('IP vem do primeiro item do proxy', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' });
    expect(ipDoPedido(h)).toBe('203.0.113.9');
    expect(ipDoPedido(new Headers())).toBe('');
  });
});

describe('Mensagens do Radar: só link de entrada (5.1 item 4)', () => {
  it('detecta qualquer link no texto da IA', () => {
    expect(contemLink('veja https://shopee.com.br/produto')).toBe(true);
    expect(contemLink('veja s.shopee.com.br/abc')).toBe(true);
    expect(contemLink('www.exemplo.invalid')).toBe(true);
    expect(contemLink('siga t.me/canal')).toBe(true);
    expect(contemLink('Criei o Precinho de Amiga. Quem quiser, é só seguir: {link}')).toBe(false);
  });

  it('o código põe o link de entrada no convite', () => {
    expect(montarConvite('Siga: {link}', 'https://exemplo.invalid/entrar?o=a')).toBe('Siga: https://exemplo.invalid/entrar?o=a');
    expect(montarConvite('Siga o canal.', 'https://exemplo.invalid/entrar?o=a')).toBe('Siga o canal. https://exemplo.invalid/entrar?o=a');
  });

  it('seguidores sem dado viram lugar para a Lana completar', () => {
    expect(completarSeguidores('com {seguidores} seguidores', null)).toBe('com [número de seguidores] seguidores');
    expect(completarSeguidores('com {seguidores} seguidores', 120)).toBe('com 120 seguidores');
  });
});

describe('contrato radar/v1', () => {
  const c = contrato('radar/v1')!;
  const entrada: EntradaRadar = { data: '2026-11-09', nichos: ['[nicho de teste]'], regiao: null, ja_vistos: [] };

  it('está registrado na rotina pa-radar e a simulação passa no próprio esquema', () => {
    expect(c.rotina).toBe('pa-radar');
    expect(c.entrada.safeParse(entrada).success).toBe(true);
    const s = c.simular(entrada) as { lugares: { nome: string; proibe_links: boolean }[] };
    expect(c.saida.safeParse(s).success).toBe(true);
    expect(s.lugares.length).toBeGreaterThan(0);
    expect(s.lugares.every((l) => /teste/i.test(l.nome))).toBe(true);
    expect(s.lugares.some((l) => l.proibe_links)).toBe(true);
  });

  it('simulação não repete lugar já visto', () => {
    const s1 = c.simular(entrada) as { lugares: { nome: string; tipo: string; url: string | null }[] };
    const vistos = s1.lugares.map((l) => chaveLugar(l));
    const s2 = c.simular({ ...entrada, ja_vistos: vistos }) as { lugares: unknown[] };
    expect(s2.lugares).toEqual([]);
  });

  it('recusa mensagem com link e convite sem a marca {link}', () => {
    const s = structuredClone(c.simular(entrada)) as { lugares: { mensagens: { pedido_admin: string; convite: string } }[] };
    s.lugares[0].mensagens.pedido_admin = 'Oi! Veja https://shopee.com.br/x';
    expect(c.saida.safeParse(s).success).toBe(false);
    const s2 = structuredClone(c.simular(entrada)) as { lugares: { mensagens: { convite: string } }[] };
    s2.lugares[0].mensagens.convite = 'Siga o canal';
    expect(c.saida.safeParse(s2).success).toBe(false);
  });
});
