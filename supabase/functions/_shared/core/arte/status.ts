// Artes do Status do WhatsApp (F-09, seção 5.6 e regra 5.1.4).
// O Status é vitrine para atrair seguidores: arte e legenda levam só o link de entrada com origem `status`,
// nunca link de oferta (nem de afiliado, nem o link comum do produto).
import { reais } from '../formato.ts';

export const ARTES_STATUS_MIN = 3;
export const ARTES_STATUS_MAX = 5;

/** Quantidade de artes do dia, sempre entre 3 e 5 (configuração da Lana, padrão 3). */
export function quantidadeArtes(configurada: unknown): number {
  const n = typeof configurada === 'number' && Number.isFinite(configurada) ? Math.round(configurada) : ARTES_STATUS_MIN;
  return Math.min(ARTES_STATUS_MAX, Math.max(ARTES_STATUS_MIN, n));
}

/** Link da página de entrada com origem `status` (rota pública `/entrar?o=<origem>`). */
export function linkEntradaStatus(siteUrl: string): string {
  const base = siteUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('endereço do site inválido para o link de entrada');
  return `${base}/entrar?o=status`;
}

/** Qualquer domínio da Shopee (link de afiliado, link curto ou link comum) é link de oferta. */
const LINK_DE_OFERTA = /(?:^|[^a-z0-9-])(?:[a-z0-9-]+\.)*(?:shopee\.[a-z.]+|shope\.ee|shp\.ee)(?:[/?#:]|\s|$)/i;

export function contemLinkDeOferta(texto: string): boolean {
  return LINK_DE_OFERTA.test(texto);
}

/** Falha alto se algum texto do Status levar link de oferta. */
export function garantirSemLinkDeOferta(...textos: string[]): void {
  for (const t of textos) {
    if (contemLinkDeOferta(t)) throw new Error('arte do Status não pode ter link de oferta (regra 5.1.4)');
  }
}

export function legendaStatus(d: { titulo: string; precoAtual: number; linkEntrada: string }): string {
  const legenda = `Achado do dia: ${d.titulo.trim()} por ${reais(d.precoAtual)}.\nEsse e outros achados saem todo dia no canal. Siga: ${d.linkEntrada}`;
  garantirSemLinkDeOferta(legenda);
  return legenda;
}

export interface OfertaCandidataStatus {
  id: string;
  produto_id: string;
  nota: number | null;
}

/** Uma arte por oferta aprovada do dia, pelas maiores notas, sem repetir produto. */
export function escolherOfertasStatus<T extends OfertaCandidataStatus>(ofertas: readonly T[], quantidade: number): T[] {
  const ordenadas = [...ofertas].sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1) || a.id.localeCompare(b.id));
  const vistos = new Set<string>();
  const out: T[] = [];
  for (const o of ordenadas) {
    if (vistos.has(o.produto_id)) continue;
    vistos.add(o.produto_id);
    out.push(o);
    if (out.length === quantidade) break;
  }
  return out;
}

/** Caminho no bucket `artes`. */
export function caminhoArteStatus(data: string, ofertaId: string): string {
  return `status/${data}/${ofertaId}.svg`;
}
