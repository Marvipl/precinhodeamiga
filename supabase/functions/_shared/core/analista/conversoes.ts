// Relatório de conversões do painel de afiliados (F-23, seção 6 "plano B sem API").
// Lê o CSV exportado do painel e devolve linhas normalizadas. Código puro.
//
// [SUPOSIÇÃO] O formato exato do CSV só é conhecido quando a conta for liberada. Os nomes de coluna
// abaixo são apelidos prováveis (português e inglês); o dono confere com um arquivo real (docs/HUMANO.md).
// Uma coluna obrigatória ausente recusa o arquivo inteiro, para nunca mostrar número errado.

import { lerNumero, centavos } from './numeros.ts';

export type StatusConversao = 'pendente' | 'concluida' | 'cancelada';

export interface Conversao {
  pedido_id: string;
  item_id: string; // '' quando o relatório não traz o item
  dia: string; // AAAA-MM-DD (Brasília)
  data_pedido: string; // ISO com fuso
  status: StatusConversao;
  valor_pedido: number;
  comissao: number;
  comissao_extra: number; // parte da comissão que veio de Comissão Extra
  sub1: string | null;
  sub2: string | null;
  sub3: string | null;
  sub4: string | null;
  sub5: string | null;
}

export type CampoCsv =
  | 'pedido_id'
  | 'item_id'
  | 'data_pedido'
  | 'status'
  | 'valor_pedido'
  | 'comissao'
  | 'comissao_extra'
  | 'sub1'
  | 'sub2'
  | 'sub3'
  | 'sub4'
  | 'sub5';

export const OBRIGATORIOS: readonly CampoCsv[] = ['pedido_id', 'data_pedido', 'status', 'comissao'];

/** Apelidos aceitos para cada campo, já normalizados (minúsculas, sem acento, `_` no lugar de espaço). */
export const APELIDOS: Record<CampoCsv, readonly string[]> = {
  pedido_id: ['id_do_pedido', 'id_pedido', 'numero_do_pedido', 'pedido', 'order_id', 'orderid', 'checkout_id'],
  item_id: ['id_do_item', 'id_item', 'item_id', 'itemid', 'id_do_produto', 'product_id'],
  data_pedido: ['horario_do_pedido', 'data_do_pedido', 'hora_do_pedido', 'data_da_compra', 'order_time', 'purchase_time', 'data'],
  status: ['status_do_pedido', 'status_da_conversao', 'order_status', 'conversion_status', 'status'],
  valor_pedido: ['valor_de_compra', 'valor_da_compra', 'valor_do_pedido', 'purchase_value', 'order_amount', 'gmv', 'valor'],
  comissao: ['comissao_total', 'comissao_total_do_pedido', 'comissao_do_pedido', 'total_commission', 'commission', 'comissao'],
  comissao_extra: ['comissao_extra', 'comissao_xtra', 'comissao_do_vendedor', 'seller_commission', 'extra_commission'],
  sub1: ['sub_id1', 'subid1', 'sub_id_1', 'sub1'],
  sub2: ['sub_id2', 'subid2', 'sub_id_2', 'sub2'],
  sub3: ['sub_id3', 'subid3', 'sub_id_3', 'sub3'],
  sub4: ['sub_id4', 'subid4', 'sub_id_4', 'sub4'],
  sub5: ['sub_id5', 'subid5', 'sub_id_5', 'sub5'],
};

export function normalizarCabecalho(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/r\$/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Lê CSV com aspas, separador `,` ou `;` (detectado pelo cabeçalho) e BOM. */
export function lerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '');
  const primeira = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primeira.match(/;/g) ?? []).length > (primeira.match(/,/g) ?? []).length ? ';' : primeira.includes('\t') && !primeira.includes(',') ? '\t' : ',';
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else campo += c;
  }
  if (campo !== '' || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((x) => x.trim() !== ''));
}

export function mapearColunas(cabecalho: readonly string[]): { mapa: Partial<Record<CampoCsv, number>>; faltando: CampoCsv[] } {
  const norm = cabecalho.map(normalizarCabecalho);
  const mapa: Partial<Record<CampoCsv, number>> = {};
  for (const campo of Object.keys(APELIDOS) as CampoCsv[]) {
    for (const apelido of APELIDOS[campo]) {
      const i = norm.indexOf(apelido);
      if (i >= 0 && !Object.values(mapa).includes(i)) {
        mapa[campo] = i;
        break;
      }
    }
  }
  return { mapa, faltando: OBRIGATORIOS.filter((c) => mapa[c] === undefined) };
}

/** [SUPOSIÇÃO] Mapeamento dos estados do relatório. Estado desconhecido recusa a linha. */
export function lerStatus(s: string): StatusConversao | null {
  const n = normalizarCabecalho(s);
  if (!n) return null;
  if (/cancel|invalid|recus|reembols|devolv|refund|nao_pago|unpaid|fail/.test(n)) return 'cancelada';
  if (/conclu|complet|finaliz|pago|paid|aprovad|validad|settled/.test(n)) return 'concluida';
  if (/pend|process|andamento|aguard|pending|ordered|em_analise/.test(n)) return 'pendente';
  return null;
}

/**
 * Data e hora do pedido no fuso de Brasília. Aceita "AAAA-MM-DD HH:MM[:SS]", "AAAA-MM-DDTHH:MM:SS[Z|±hh:mm]"
 * e "DD/MM/AAAA HH:MM[:SS]". Sem fuso explícito, a hora é de Brasília (UTC-3 fixo desde 2019).
 */
export function lerDataHora(s: string): { dia: string; iso: string } | null {
  const t = s.trim();
  let a: string, m: string, d: string, hh = '00', mm = '00', ss = '00', fuso = '-03:00';
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/);
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (iso) {
    [, a, m, d] = iso;
    if (iso[4]) [hh, mm, ss] = [iso[4].padStart(2, '0'), iso[5], iso[6] ?? '00'];
    if (iso[7]) fuso = iso[7] === 'Z' ? 'Z' : iso[7].length === 5 ? `${iso[7].slice(0, 3)}:${iso[7].slice(3)}` : iso[7];
  } else if (br) {
    [d, m, a] = [br[1].padStart(2, '0'), br[2].padStart(2, '0'), br[3]];
    if (br[4]) [hh, mm, ss] = [br[4].padStart(2, '0'), br[5], br[6] ?? '00'];
  } else return null;
  const instante = new Date(`${a}-${m}-${d}T${hh}:${mm}:${ss}${fuso}`);
  if (Number.isNaN(instante.getTime())) return null;
  // Dia de calendário em Brasília (UTC-3).
  const local = new Date(instante.getTime() - 3 * 3_600_000);
  if (Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  return { dia: local.toISOString().slice(0, 10), iso: instante.toISOString() };
}

export interface ErroLinha {
  linha: number; // número da linha no arquivo (cabeçalho = 1)
  motivo: string;
}

export interface ResultadoCsv {
  conversoes: Conversao[];
  erros: ErroLinha[];
  faltando: CampoCsv[];
  linhasLidas: number;
  periodo: { inicio: string; fim: string } | null;
}

function texto(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' || t === '-' ? null : t;
}

/**
 * Lê o CSV do relatório de conversões. Linhas com o mesmo pedido e item (ou o mesmo pedido, quando o
 * relatório não traz o item) são somadas, para a reimportação do mesmo arquivo dar o mesmo resultado.
 */
export function lerRelatorioCsv(conteudo: string): ResultadoCsv {
  const linhas = lerCsv(conteudo);
  if (linhas.length === 0) return { conversoes: [], erros: [{ linha: 1, motivo: 'arquivo vazio' }], faltando: [...OBRIGATORIOS], linhasLidas: 0, periodo: null };
  const { mapa, faltando } = mapearColunas(linhas[0]);
  if (faltando.length) return { conversoes: [], erros: [], faltando, linhasLidas: linhas.length - 1, periodo: null };

  const col = (l: string[], c: CampoCsv) => (mapa[c] === undefined ? undefined : l[mapa[c] as number]);
  const porChave = new Map<string, Conversao>();
  const erros: ErroLinha[] = [];

  linhas.slice(1).forEach((l, i) => {
    const n = i + 2;
    const pedido = texto(col(l, 'pedido_id'));
    if (!pedido) return erros.push({ linha: n, motivo: 'sem número do pedido' });
    const data = lerDataHora(col(l, 'data_pedido') ?? '');
    if (!data) return erros.push({ linha: n, motivo: `data do pedido ilegível: "${col(l, 'data_pedido') ?? ''}"` });
    const status = lerStatus(col(l, 'status') ?? '');
    if (!status) return erros.push({ linha: n, motivo: `status desconhecido: "${col(l, 'status') ?? ''}"` });
    const comissao = lerNumero(col(l, 'comissao'));
    if (comissao === null || comissao < 0) return erros.push({ linha: n, motivo: `comissão ilegível: "${col(l, 'comissao') ?? ''}"` });
    const valor = mapa.valor_pedido === undefined ? 0 : lerNumero(col(l, 'valor_pedido'));
    if (valor === null || valor < 0) return erros.push({ linha: n, motivo: `valor do pedido ilegível: "${col(l, 'valor_pedido') ?? ''}"` });
    const extra = mapa.comissao_extra === undefined ? 0 : (lerNumero(col(l, 'comissao_extra')) ?? 0);
    if (extra < 0 || extra > comissao + 0.005) return erros.push({ linha: n, motivo: 'Comissão Extra maior que a comissão total' });

    const item = texto(col(l, 'item_id')) ?? '';
    const chave = `${pedido}\u0000${item}`;
    const atual = porChave.get(chave);
    if (atual) {
      atual.valor_pedido = centavos(atual.valor_pedido + valor);
      atual.comissao = centavos(atual.comissao + comissao);
      atual.comissao_extra = centavos(atual.comissao_extra + extra);
      return;
    }
    porChave.set(chave, {
      pedido_id: pedido,
      item_id: item,
      dia: data.dia,
      data_pedido: data.iso,
      status,
      valor_pedido: centavos(valor),
      comissao: centavos(comissao),
      comissao_extra: centavos(extra),
      sub1: texto(col(l, 'sub1'))?.toLowerCase() ?? null,
      sub2: texto(col(l, 'sub2')),
      sub3: texto(col(l, 'sub3')),
      sub4: texto(col(l, 'sub4'))?.toLowerCase() ?? null,
      sub5: texto(col(l, 'sub5')),
    });
  });

  const conversoes = [...porChave.values()];
  const dias = conversoes.map((c) => c.dia).sort();
  return {
    conversoes,
    erros,
    faltando: [],
    linhasLidas: linhas.length - 1,
    periodo: dias.length ? { inicio: dias[0], fim: dias[dias.length - 1] } : null,
  };
}

/** Estado da importação para a tela ("importação com erro"). */
export function estadoImportacao(r: ResultadoCsv): 'ok' | 'parcial' | 'erro' {
  if (r.faltando.length || r.conversoes.length === 0) return 'erro';
  return r.erros.length ? 'parcial' : 'ok';
}

export const ROTULO_CAMPO: Record<CampoCsv, string> = {
  pedido_id: 'número do pedido',
  item_id: 'item',
  data_pedido: 'data do pedido',
  status: 'status do pedido',
  valor_pedido: 'valor da compra',
  comissao: 'comissão total',
  comissao_extra: 'Comissão Extra',
  sub1: 'Sub_id1',
  sub2: 'Sub_id2',
  sub3: 'Sub_id3',
  sub4: 'Sub_id4',
  sub5: 'Sub_id5',
};
