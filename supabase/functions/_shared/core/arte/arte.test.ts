import { describe, expect, it } from 'vitest';
import {
  CHAMADA_ARTE,
  caminhoArteStatus,
  contemLinkDeOferta,
  escaparXml,
  escolherOfertasStatus,
  garantirSemLinkDeOferta,
  legendaStatus,
  linkEntradaStatus,
  montarArteSvg,
  mostrarDePor,
  quantidadeArtes,
  quebrarLinhas,
} from './index.ts';

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('arte: modelo fixo (F-06, F-09)', () => {
  it('tem foto, preço, nome e "Siga o canal"', () => {
    const svg = montarArteSvg({ titulo: 'Produto de teste A', precoAtual: 39.9, imagem: PNG_1PX });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('width="1080" height="1920"');
    expect(svg).toContain('Produto de teste A');
    expect(svg).toContain('Por R$ 39,90');
    expect(svg).toContain(CHAMADA_ARTE);
    expect(svg).toContain(`href="${PNG_1PX}"`);
    expect(svg).not.toContain('De R$');
  });

  it('sem foto usa o quadro listrado do mock', () => {
    const svg = montarArteSvg({ titulo: 'Produto de teste B', precoAtual: 10 });
    expect(svg).toContain('url(#listras)');
    expect(svg).toContain('Foto do produto');
  });

  it('não aceita imagem que não seja data URI de imagem (evita injeção e link externo)', () => {
    const svg = montarArteSvg({ titulo: 'Produto de teste C', precoAtual: 10, imagem: 'https://exemplo.invalid/a.png" onload="x' });
    expect(svg).not.toContain('exemplo.invalid');
    expect(svg).toContain('url(#listras)');
  });

  it('escapa o nome do produto', () => {
    const svg = montarArteSvg({ titulo: 'Kit <teste> & "aspas"', precoAtual: 5 });
    expect(svg).toContain('Kit &lt;teste&gt; &amp; &quot;aspas&quot;');
    expect(svg).not.toContain('<teste>');
    expect(escaparXml("a'b")).toBe('a&apos;b');
  });

  it('mostra "De R$" só quando o "de" é maior que o atual', () => {
    expect(mostrarDePor(50, null)).toBe(false);
    expect(mostrarDePor(50, 50)).toBe(false);
    expect(mostrarDePor(50, 60)).toBe(true);
    const svg = montarArteSvg({ titulo: 'Produto de teste D', precoAtual: 50, precoReferencia: 60 });
    expect(svg).toContain('De R$ 60,00');
    expect(svg).toContain('line-through');
  });

  it('quebra o nome em até 3 linhas com reticências', () => {
    expect(quebrarLinhas('Produto de teste curto', 26, 3)).toEqual(['Produto de teste curto']);
    const longo = 'Produto de teste com um nome muito comprido que não cabe de jeito nenhum em três linhas da arte do status';
    const l = quebrarLinhas(longo, 26, 3);
    expect(l).toHaveLength(3);
    expect(l.every((x) => x.length <= 26)).toBe(true);
    expect(l[2].endsWith('…')).toBe(true);
    expect(quebrarLinhas('Palavrasemespaconenhumquepassadolimite', 10, 2)[0].length).toBeLessThanOrEqual(10);
  });
});

describe('Status do WhatsApp: só link de entrada (regra 5.1.4)', () => {
  it('link de entrada com origem status', () => {
    expect(linkEntradaStatus('https://precinho.exemplo.invalid/')).toBe('https://precinho.exemplo.invalid/entrar?o=status');
    expect(() => linkEntradaStatus('')).toThrow();
  });

  it('reconhece links da Shopee como link de oferta', () => {
    for (const t of [
      'https://shopee.com.br/produto-i.1.2',
      'veja s.shopee.com.br/abc',
      'https://shope.ee/abc',
      'https://affiliate.shopee.com.br/x',
      'shp.ee/xyz',
    ]) {
      expect(contemLinkDeOferta(t), t).toBe(true);
    }
    expect(contemLinkDeOferta('https://precinho.exemplo.invalid/entrar?o=status')).toBe(false);
    expect(contemLinkDeOferta('notshopee.example')).toBe(false);
    expect(() => garantirSemLinkDeOferta('ok', 'https://shope.ee/a')).toThrow(/link de oferta/);
  });

  it('a legenda leva o link de entrada e nunca link de oferta', () => {
    const link = linkEntradaStatus('https://precinho.exemplo.invalid');
    const legenda = legendaStatus({ titulo: 'Produto de teste A', precoAtual: 19.9, linkEntrada: link });
    expect(legenda).toContain(link);
    expect(legenda).toContain('R$ 19,90');
    expect(contemLinkDeOferta(legenda)).toBe(false);
    expect(() => legendaStatus({ titulo: 'Produto de teste A', precoAtual: 1, linkEntrada: 'https://shope.ee/x' })).toThrow();
  });

  it('a arte não tem link nenhum', () => {
    const svg = montarArteSvg({ titulo: 'Produto de teste A', precoAtual: 1, imagem: PNG_1PX });
    expect(svg.replace(/http:\/\/www\.w3\.org\/[^"]+/g, '')).not.toMatch(/https?:\/\//);
  });

  it('quantidade sempre entre 3 e 5 (padrão 3)', () => {
    expect(quantidadeArtes(undefined)).toBe(3);
    expect(quantidadeArtes(1)).toBe(3);
    expect(quantidadeArtes(4)).toBe(4);
    expect(quantidadeArtes(9)).toBe(5);
    expect(quantidadeArtes('5')).toBe(3);
  });

  it('escolhe as maiores notas, uma por produto', () => {
    const ofertas = [
      { id: 'o1', produto_id: 'p1', nota: 70 },
      { id: 'o2', produto_id: 'p2', nota: 90 },
      { id: 'o3', produto_id: 'p1', nota: 95 },
      { id: 'o4', produto_id: 'p3', nota: null },
      { id: 'o5', produto_id: 'p4', nota: 60 },
    ];
    expect(escolherOfertasStatus(ofertas, 3).map((o) => o.id)).toEqual(['o3', 'o2', 'o5']);
    expect(escolherOfertasStatus(ofertas, 5).map((o) => o.id)).toEqual(['o3', 'o2', 'o5', 'o4']);
    expect(escolherOfertasStatus([], 3)).toEqual([]);
  });

  it('caminho no bucket', () => {
    expect(caminhoArteStatus('2026-11-02', 'abc')).toBe('status/2026-11-02/abc.svg');
  });
});
