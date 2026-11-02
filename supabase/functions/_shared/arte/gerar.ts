// F-09: prepara as artes do Status do dia (3 a 5, uma por oferta aprovada, pelas maiores notas).
// Busca a foto do produto no servidor (evita bloqueio de CORS no navegador), embute na arte SVG,
// grava no bucket `artes` e registra em `artes_status`. O painel converte para PNG ao baixar.
// Nada aqui envia mensagem para o WhatsApp (regra 5.1.2): a Lana baixa e posta à mão.
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolverConfig } from '../core/config.ts';
import { montarArteSvg } from '../core/arte/modelo.ts';
import {
  caminhoArteStatus,
  escolherOfertasStatus,
  garantirSemLinkDeOferta,
  legendaStatus,
  linkEntradaStatus,
  quantidadeArtes,
} from '../core/arte/status.ts';

export const BUCKET_ARTES = 'artes';
const LIMITE_IMAGEM = 4 * 1024 * 1024;

interface OfertaComProduto {
  id: string;
  produto_id: string;
  nota: number | null;
  preco_atual: number;
  preco_referencia: number | null;
  produtos: { nome: string; imagem_url: string | null } | null;
}

function base64(bytes: Uint8Array): string {
  let s = '';
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) s += String.fromCharCode(...bytes.subarray(i, i + passo));
  return btoa(s);
}

/** Baixa uma imagem e devolve como data URI. Qualquer falha devolve null (a arte sai com o quadro listrado). */
export async function imagemComoDataUri(url: string | null | undefined, buscar: typeof fetch = fetch): Promise<string | null> {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const r = await buscar(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const tipo = (r.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(tipo)) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length === 0 || bytes.length > LIMITE_IMAGEM) return null;
    return `data:${tipo};base64,${base64(bytes)}`;
  } catch {
    return null;
  }
}

export interface ResultadoArtes {
  data: string;
  quantidade: number;
  geradas: number;
  existentes: number;
  aviso?: string;
}

export async function gerarArtesDoDia(
  sb: SupabaseClient,
  opcoes: { data: string; siteUrl: string; refazer?: boolean; buscar?: typeof fetch },
): Promise<ResultadoArtes> {
  const { data, siteUrl, refazer = false, buscar = fetch } = opcoes;
  const linkEntrada = linkEntradaStatus(siteUrl);

  const cfg = await sb.from('configuracoes').select('chave, valor').eq('chave', 'status.artes_por_dia');
  if (cfg.error) throw new Error(cfg.error.message);
  const quantidade = quantidadeArtes(resolverConfig(cfg.data ?? []).artesStatusPorDia);

  const ofertas = await sb
    .from('ofertas')
    .select('id, produto_id, nota, preco_atual, preco_referencia, produtos(nome, imagem_url)')
    .eq('data', data)
    .eq('estado', 'aprovada');
  if (ofertas.error) throw new Error(ofertas.error.message);
  const escolhidas = escolherOfertasStatus((ofertas.data ?? []) as unknown as OfertaComProduto[], quantidade);

  const jaFeitas = await sb.from('artes_status').select('oferta_id').eq('data', data);
  if (jaFeitas.error) throw new Error(jaFeitas.error.message);
  const existentes = new Set((jaFeitas.data ?? []).map((a: { oferta_id: string | null }) => a.oferta_id));

  if (escolhidas.length === 0) {
    return { data, quantidade, geradas: 0, existentes: existentes.size, aviso: 'Nenhuma oferta aprovada hoje ainda.' };
  }

  const icone = await imagemComoDataUri(`${siteUrl.replace(/\/+$/, '')}/icone-192.png`, buscar);
  let geradas = 0;
  for (const o of escolhidas) {
    if (!refazer && existentes.has(o.id)) continue;
    const titulo = o.produtos?.nome ?? 'Produto';
    const svg = montarArteSvg({
      titulo,
      precoAtual: Number(o.preco_atual),
      precoReferencia: o.preco_referencia === null ? null : Number(o.preco_referencia),
      imagem: await imagemComoDataUri(o.produtos?.imagem_url, buscar),
      icone,
    });
    const legenda = legendaStatus({ titulo, precoAtual: Number(o.preco_atual), linkEntrada });
    garantirSemLinkDeOferta(svg, legenda);

    const caminho = caminhoArteStatus(data, o.id);
    const up = await sb.storage
      .from(BUCKET_ARTES)
      .upload(caminho, new Blob([svg], { type: 'image/svg+xml' }), { contentType: 'image/svg+xml', upsert: true });
    if (up.error) throw new Error(`falha ao gravar a arte: ${up.error.message}`);

    const reg = await sb
      .from('artes_status')
      .upsert({ data, oferta_id: o.id, arte_path: caminho, legenda, baixada_em: null }, { onConflict: 'data,oferta_id' });
    if (reg.error) throw new Error(reg.error.message);
    geradas++;
  }

  if (geradas > 0) {
    await sb.from('atividades').insert({ agente: 'redatora', texto: `Preparou ${geradas} arte(s) do Status`, link: '/publicar' });
  }
  return { data, quantidade, geradas, existentes: existentes.size };
}
