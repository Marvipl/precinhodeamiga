import { describe, expect, it } from 'vitest';
import { aplicarAcao, type LugarAcao, type StoreRadar } from './acoes.ts';
import { tratarEntrada, type DepsEntrada } from './entrada-clique.ts';
import { linhasDosLugares } from './linhas.ts';
import { liberadosHoje, textoLembrete } from './lembrete.ts';
import { contrato } from '../core/contratos/index.ts';
import type { SaidaRadar } from '../core/contratos/radar.ts';

function storeFalso(lugares: LugarAcao[], divs: { lugar_id: string; divulgado_em: string; origem?: string }[] = []) {
  const atividades: string[] = [];
  const store: StoreRadar = {
    lerLugar: async (id) => lugares.find((l) => l.id === id) ?? null,
    origensUsadas: async () => lugares.map((l) => l.origem).filter((o): o is string => !!o),
    ultimaDivulgacao: async (id) => divs.filter((d) => d.lugar_id === id).sort((a, b) => b.divulgado_em.localeCompare(a.divulgado_em))[0]?.divulgado_em ?? null,
    atualizarLugar: async (id, campos) => {
      Object.assign(lugares.find((l) => l.id === id)!, campos);
    },
    inserirDivulgacao: async (d) => {
      divs.push(d);
    },
    atividade: async (t) => {
      atividades.push(t);
    },
  };
  return { store, atividades, divs };
}

const lugar = (p: Partial<LugarAcao> = {}): LugarAcao => ({
  id: 'l1',
  nome: 'Lugar de teste A',
  estado: 'novo',
  proibe_links: false,
  origem: null,
  dias_permitidos: [],
  intervalo_dias: null,
  ...p,
});

describe('ações do Radar', () => {
  const sexta = new Date('2026-11-06T13:00:00Z');

  it('aprovar gera origem única, guarda dias e intervalo e calcula a próxima vez', async () => {
    const ls = [lugar({ estado: 'aguardando' }), lugar({ id: 'l2', nome: 'Outro', estado: 'aprovado', origem: 'lugar-de-teste-a', dias_permitidos: [1], intervalo_dias: 7 })];
    const { store, atividades } = storeFalso(ls);
    const r = await aplicarAcao(store, { lugar_id: 'l1', acao: 'aprovou', dias_permitidos: [5, 5, 1], intervalo_dias: 7 }, 'u1', new Date('2026-11-02T13:00:00Z'));
    expect(r.ok).toBe(false); // dia repetido
    const r2 = await aplicarAcao(store, { lugar_id: 'l1', acao: 'aprovou', dias_permitidos: [5, 1], intervalo_dias: 7 }, 'u1', new Date('2026-11-03T13:00:00Z'));
    expect(r2).toEqual({ ok: true, estado: 'aprovado', origem: 'lugar-de-teste-a-2', proxima: '2026-11-06' });
    expect(ls[0].dias_permitidos).toEqual([1, 5]);
    expect(atividades).toHaveLength(1);
  });

  it('"Divulguei hoje" registra só no dia permitido e uma vez por intervalo', async () => {
    const ls = [lugar({ estado: 'aprovado', origem: 'lugar-a', dias_permitidos: [5], intervalo_dias: 7 })];
    const { store, divs } = storeFalso(ls);
    const quinta = await aplicarAcao(store, { lugar_id: 'l1', acao: 'divulguei' }, 'u1', new Date('2026-11-05T13:00:00Z'));
    expect(quinta.ok).toBe(false);
    const ok = await aplicarAcao(store, { lugar_id: 'l1', acao: 'divulguei' }, 'u1', sexta);
    expect(ok).toEqual({ ok: true, estado: 'aprovado', origem: 'lugar-a', proxima: '2026-11-13' });
    expect(divs).toHaveLength(1);
    expect(divs[0].origem).toBe('lugar-a');
    const de_novo = await aplicarAcao(store, { lugar_id: 'l1', acao: 'divulguei' }, 'u1', sexta);
    expect(de_novo.ok).toBe(false);
  });

  it('lugar que proíbe links não entra na lista', async () => {
    const { store } = storeFalso([lugar({ proibe_links: true })]);
    const r = await aplicarAcao(store, { lugar_id: 'l1', acao: 'adicionar' }, 'u1');
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it('pedido inválido e lugar inexistente', async () => {
    const { store } = storeFalso([]);
    expect(await aplicarAcao(store, { lugar_id: 'l1', acao: 'apagar' as never }, null)).toMatchObject({ ok: false, status: 400 });
    expect(await aplicarAcao(store, { lugar_id: 'x', acao: 'descartar' }, null)).toMatchObject({ ok: false, status: 404 });
  });
});

function depsFalsas(p: Partial<DepsEntrada> = {}) {
  const contados: { origem: string; botao: string; resumo: string }[] = [];
  const vistos = new Set<string>();
  const deps: DepsEntrada = {
    origemConhecida: async (o) => o === 'lugar-a',
    salDoDia: async () => 'sal-de-teste',
    registrar: async (origem, botao, resumo) => {
      if (vistos.has(resumo)) return false;
      vistos.add(resumo);
      contados.push({ origem, botao, resumo });
      return true;
    },
    linksCanais: async () => ({ wa: 'https://exemplo.invalid/canal-wa', tg: '' }),
    urlSite: 'https://painel.exemplo.invalid',
    ...p,
  };
  return { deps, contados };
}

const pedido = (url: string, init: RequestInit = {}) =>
  new Request(url, { ...init, headers: { 'x-forwarded-for': '203.0.113.9', 'user-agent': 'navegador de teste', ...(init.headers ?? {}) } });

describe('função entrada-clique', () => {
  const FN = 'https://fn.exemplo.invalid/functions/v1/entrada-clique';

  it('abrir a página conta um clique por origem, sem repetir no mesmo dia', async () => {
    const { deps, contados } = depsFalsas();
    const r = await tratarEntrada(pedido(FN, { method: 'POST', body: JSON.stringify({ o: 'lugar-a' }) }), deps);
    expect(await r.json()).toEqual({ origem: 'lugar-a', whatsapp: true, telegram: false });
    await tratarEntrada(pedido(FN, { method: 'POST', body: JSON.stringify({ o: 'lugar-a' }) }), deps);
    expect(contados).toHaveLength(1);
    expect(contados[0]).toMatchObject({ origem: 'lugar-a', botao: 'pagina' });
    expect(JSON.stringify(contados)).not.toContain('203.0.113.9');
  });

  it('origem desconhecida conta como direto', async () => {
    const { deps, contados } = depsFalsas();
    await tratarEntrada(pedido(FN, { method: 'POST', body: JSON.stringify({ o: 'inventada' }) }), deps);
    await tratarEntrada(pedido(FN, { method: 'POST', body: '{}' }), deps);
    expect(contados.map((c) => c.origem)).toEqual(['direto']);
  });

  it('botão leva ao canal e conta por botão', async () => {
    const { deps, contados } = depsFalsas();
    const r = await tratarEntrada(pedido(`${FN}?o=lugar-a&b=wa`), deps);
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('https://exemplo.invalid/canal-wa');
    expect(contados).toEqual([expect.objectContaining({ origem: 'lugar-a', botao: 'wa' })]);
  });

  it('canal sem link volta para a página de entrada sem contar', async () => {
    const { deps, contados } = depsFalsas();
    const r = await tratarEntrada(pedido(`${FN}?o=lugar-a&b=tg`), deps);
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('https://painel.exemplo.invalid/entrar?indisponivel=1&o=lugar-a');
    expect(contados).toEqual([]);
  });

  it('botão inválido e método não permitido', async () => {
    const { deps } = depsFalsas();
    expect((await tratarEntrada(pedido(`${FN}?b=x`), deps)).status).toBe(400);
    expect((await tratarEntrada(pedido(FN, { method: 'DELETE' }), deps)).status).toBe(405);
  });
});

describe('processador do Radar', () => {
  it('grava lugares novos com aviso quando a regra proíbe links e sem repetir', () => {
    const c = contrato('radar/v1')!;
    const s = c.simular({ data: '2026-11-09', nichos: [], regiao: null, ja_vistos: [] }) as SaidaRadar;
    const dobrada: SaidaRadar = { lugares: [...s.lugares, s.lugares[0]] };
    const linhas = linhasDosLugares(dobrada, 'job-1');
    expect(linhas).toHaveLength(s.lugares.length);
    expect(linhas.every((l) => l.estado === 'novo' && l.job_id === 'job-1')).toBe(true);
    const proibe = linhas.find((l) => l.proibe_links)!;
    expect(proibe.aviso).toMatch(/proíbe links/);
    expect(linhas.filter((l) => !l.proibe_links).every((l) => l.aviso === null)).toBe(true);
  });
});

describe('lembrete no dia permitido', () => {
  it('lista só os lugares liberados hoje', () => {
    const base = { estado: 'aprovado', dias_permitidos: [5], intervalo_dias: 7 };
    const nomes = liberadosHoje(
      [
        { ...base, id: 'a', nome: 'Lugar A', ultima: null },
        { ...base, id: 'b', nome: 'Lugar B', ultima: '2026-11-06T12:00:00Z' },
        { ...base, id: 'c', nome: 'Lugar C', dias_permitidos: [1], ultima: null },
      ],
      new Date('2026-11-06T15:00:00Z'),
    );
    expect(nomes).toEqual(['Lugar A']);
    expect(textoLembrete(['Lugar A', 'Lugar B']).corpo).toBe('Hoje é dia permitido em "Lugar A" e "Lugar B". O convite já está pronto no Radar.');
  });
});
