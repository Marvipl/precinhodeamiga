// Modelo fixo da arte (F-06, F-09): foto do produto, preço, nome e "Siga o canal". Sem IA de imagem (seção 9).
// Gera um SVG 1080x1920 (9:16, tamanho do Status do WhatsApp). O painel converte para PNG na hora de baixar.
// Código puro: roda no navegador, no Node (testes) e no Deno (Edge Functions).
import { reais } from '../formato.ts';

export const ARTE_LARGURA = 1080;
export const ARTE_ALTURA = 1920;

/** Cores do mock (classe `.art` de src/styles/global.css). */
export const CORES_ARTE = {
  fundoTopo: '#6B1063',
  fundoBase: '#4A0C44',
  texto: '#FFFFFF',
  textoSuave: '#F3E3F0',
  preco: '#FFB37A',
  chamadaFundo: '#F5B400',
  chamadaTexto: '#2A0E28',
} as const;

export const CHAMADA_ARTE = 'Siga o canal';

export interface DadosArte {
  titulo: string;
  precoAtual: number;
  /** Só quando a plataforma confirmou o "de" (mediana com desconto real). `null` = só "Por R$". */
  precoReferencia?: number | null;
  /** Foto do produto como data URI (`data:image/...;base64,...`). Sem foto, fica o quadro listrado do mock. */
  imagem?: string | null;
  /** Ícone da marca como data URI. Opcional. */
  icone?: string | null;
}

export function escaparXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Quebra o texto em até `maxLinhas` linhas de até `maxCaracteres`; o que sobrar vira reticências. */
export function quebrarLinhas(texto: string, maxCaracteres: number, maxLinhas: number): string[] {
  const palavras = texto.trim().split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = '';
  let i = 0;
  for (; i < palavras.length; i++) {
    let p = palavras[i];
    if (p.length > maxCaracteres) p = p.slice(0, maxCaracteres - 1) + '…';
    const tentativa = atual ? `${atual} ${p}` : p;
    if (tentativa.length <= maxCaracteres) {
      atual = tentativa;
      continue;
    }
    linhas.push(atual);
    atual = p;
    if (linhas.length === maxLinhas) break;
  }
  if (linhas.length < maxLinhas && atual) {
    linhas.push(atual);
    atual = '';
    i = palavras.length;
  }
  const sobrou = i < palavras.length || atual !== '';
  if (sobrou && linhas.length > 0) {
    const ult = linhas[linhas.length - 1];
    linhas[linhas.length - 1] = (ult.length >= maxCaracteres ? ult.slice(0, maxCaracteres - 1) : ult) + '…';
  }
  return linhas;
}

function dataUriSegura(uri: string | null | undefined): string | null {
  if (!uri) return null;
  return /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(uri) ? uri : null;
}

/** Só mostra "De R$" quando o "de" existe e é maior que o preço atual. */
export function mostrarDePor(precoAtual: number, precoReferencia?: number | null): boolean {
  return typeof precoReferencia === 'number' && precoReferencia > precoAtual;
}

export function montarArteSvg(d: DadosArte): string {
  const W = ARTE_LARGURA;
  const H = ARTE_ALTURA;
  const M = 72; // margem
  const LADO_FOTO = 840;
  const foto = { x: (W - LADO_FOTO) / 2, y: 248, w: LADO_FOTO, h: LADO_FOTO };
  const fontTitulo = "'Baloo 2', 'Arial Rounded MT Bold', Arial, sans-serif";
  const fontCorpo = "'Nunito Sans', Arial, sans-serif";
  const img = dataUriSegura(d.imagem);
  const icone = dataUriSegura(d.icone);
  const linhasNome = quebrarLinhas(d.titulo, 26, 3);
  const nomeY0 = foto.y + foto.h + 116;
  const nome = linhasNome
    .map((l, i) => `<tspan x="${M}" y="${nomeY0 + i * 76}">${escaparXml(l)}</tspan>`)
    .join('');
  const ultimaLinhaY = nomeY0 + (linhasNome.length - 1) * 76;
  const dePor = mostrarDePor(d.precoAtual, d.precoReferencia);
  const precoY = ultimaLinhaY + (dePor ? 230 : 160);
  const linhaDe = dePor
    ? `<text x="${M}" y="${ultimaLinhaY + 96}" font-family="${fontCorpo}" font-size="48" font-weight="700" fill="${CORES_ARTE.textoSuave}" text-decoration="line-through">De ${escaparXml(reais(d.precoReferencia as number))}</text>`
    : '';
  const chamada = { w: W - 2 * M, h: 128, y: H - M - 128 };

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    '<defs>',
    `<linearGradient id="fundo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${CORES_ARTE.fundoTopo}"/><stop offset="1" stop-color="${CORES_ARTE.fundoBase}"/></linearGradient>`,
    '<pattern id="listras" width="48" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="48" height="48" fill="rgba(255,255,255,0.06)"/><rect width="24" height="48" fill="rgba(255,255,255,0.14)"/></pattern>',
    `<clipPath id="recorte"><rect x="${foto.x}" y="${foto.y}" width="${foto.w}" height="${foto.h}" rx="40"/></clipPath>`,
    '</defs>',
    `<rect width="${W}" height="${H}" fill="url(#fundo)"/>`,
    // marca
    `<rect x="${M}" y="${M}" width="120" height="120" rx="28" fill="#FFFFFF"/>`,
    icone ? `<image x="${M + 10}" y="${M + 10}" width="100" height="100" href="${icone}" xlink:href="${icone}" preserveAspectRatio="xMidYMid meet"/>` : '',
    `<text x="${M + 150}" y="${M + 78}" font-family="${fontTitulo}" font-size="52" font-weight="800" fill="${CORES_ARTE.texto}">Precinho de Amiga</text>`,
    // foto
    img
      ? `<rect x="${foto.x}" y="${foto.y}" width="${foto.w}" height="${foto.h}" rx="40" fill="#FFFFFF"/><image x="${foto.x}" y="${foto.y}" width="${foto.w}" height="${foto.h}" href="${img}" xlink:href="${img}" preserveAspectRatio="xMidYMid meet" clip-path="url(#recorte)"/>`
      : `<rect x="${foto.x}" y="${foto.y}" width="${foto.w}" height="${foto.h}" rx="40" fill="url(#listras)"/><text x="${W / 2}" y="${foto.y + foto.h / 2}" text-anchor="middle" font-family="${fontCorpo}" font-size="40" fill="${CORES_ARTE.textoSuave}">Foto do produto</text>`,
    // nome
    `<text font-family="${fontTitulo}" font-size="64" font-weight="800" fill="${CORES_ARTE.texto}">${nome}</text>`,
    // preço
    linhaDe,
    `<text x="${M}" y="${precoY}" font-family="${fontTitulo}" font-size="116" font-weight="800" fill="${CORES_ARTE.preco}">Por ${escaparXml(reais(d.precoAtual))}</text>`,
    // chamada
    `<rect x="${M}" y="${chamada.y}" width="${chamada.w}" height="${chamada.h}" rx="64" fill="${CORES_ARTE.chamadaFundo}"/>`,
    `<text x="${W / 2}" y="${chamada.y + 84}" text-anchor="middle" font-family="${fontTitulo}" font-size="60" font-weight="800" fill="${CORES_ARTE.chamadaTexto}">${CHAMADA_ARTE}</text>`,
    '</svg>',
  ].join('');
}
