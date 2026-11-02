// Níveis 1 a 4 da Atendente (seção 5.13): categorias fechadas, menu do bot, regras de palavra-chave
// e textos fixos. Código puro. A IA nunca escreve o texto do nível 1: ele é montado aqui.
import { normalizar } from './texto.ts';

export type Nivel = 1 | 2 | 3 | 4;

/** Categorias fechadas: só elas podem virar automáticas (seção 5.13, "Vira automática"). */
export const CATEGORIAS_NIVEL1 = ['cupom', 'link', 'como_funciona', 'oferta_vale', 'entrega'] as const;
export const CATEGORIAS_NIVEL2 = ['medidas', 'cores', 'prazo'] as const;
export const CATEGORIAS_FECHADAS = [...CATEGORIAS_NIVEL1, ...CATEGORIAS_NIVEL2] as const;

export type CategoriaNivel1 = (typeof CATEGORIAS_NIVEL1)[number];
export type CategoriaNivel2 = (typeof CATEGORIAS_NIVEL2)[number];
export type CategoriaFechada = (typeof CATEGORIAS_FECHADAS)[number];

export function eCategoriaFechada(c: unknown): c is CategoriaFechada {
  return typeof c === 'string' && (CATEGORIAS_FECHADAS as readonly string[]).includes(c);
}
export function eCategoriaNivel1(c: unknown): c is CategoriaNivel1 {
  return typeof c === 'string' && (CATEGORIAS_NIVEL1 as readonly string[]).includes(c);
}
export function eCategoriaNivel2(c: unknown): c is CategoriaNivel2 {
  return typeof c === 'string' && (CATEGORIAS_NIVEL2 as readonly string[]).includes(c);
}

export const ROTULO_CATEGORIA: Record<CategoriaFechada, string> = {
  cupom: 'Cupom',
  link: 'Link que não abre',
  como_funciona: 'Como funciona o canal',
  oferta_vale: 'A oferta ainda vale',
  entrega: 'Problema com entrega',
  medidas: 'Medidas',
  cores: 'Cores',
  prazo: 'Prazo',
};

/** Botões do menu do bot (seção 4.3). Os cinco primeiros são nível 1. */
export const MENU_BOT = [
  { id: 'cupom', rotulo: 'Cupom' },
  { id: 'link', rotulo: 'O link não abre' },
  { id: 'como_funciona', rotulo: 'Como funciona o canal' },
  { id: 'oferta_vale', rotulo: 'A oferta ainda vale?' },
  { id: 'entrega', rotulo: 'Problema com a entrega' },
  { id: 'pedido', rotulo: 'Fazer um pedido' },
  { id: 'falar_lana', rotulo: 'Falar com a Lana' },
] as const;
export type BotaoMenu = (typeof MENU_BOT)[number]['id'];

export const OFERECE_LANA = 'Se preferir, toque em "Falar com a Lana".';

/**
 * Textos fixos sugeridos do nível 1. Só saem sozinhos depois que a Lana aprova o texto
 * (na tela Comunidade ou aprovando 3 vezes seguidas sem editar). Até lá viram rascunho.
 * Campos entre chaves são preenchidos por código.
 */
export const TEXTOS_NIVEL1: Record<CategoriaNivel1, string> = {
  cupom:
    'Quando uma oferta tem cupom, ele aparece no próprio post, junto do preço. Se o post não fala de cupom, é porque não encontrei cupom para aquela oferta.',
  link:
    'Às vezes o link abre melhor direto no app da Shopee: toque e segure no link, copie e cole na busca do app. Se mesmo assim não abrir, me mande o nome do produto que eu peço para a Lana conferir.',
  como_funciona:
    'A Precinho de Amiga compartilha achados com desconto de verdade, comparando com o histórico de preço do produto. A Lana aprova cada post antes de sair. Os links geram comissão para a Precinho, sem custo a mais para você.',
  oferta_vale:
    'Preço e estoque mudam rápido na Shopee. O valor que vale é o que aparece na Shopee na hora da compra. Se o preço mudou, o post ficou antigo.',
  entrega:
    'Entrega, troca e reembolso são feitos pela Shopee. No app, abra "Meus pedidos", escolha o pedido e fale com o vendedor pelo chat ou toque em ajuda. A Precinho não tem acesso aos seus pedidos.',
};

export const TEXTO_PEDIR_PRODUTO =
  'Me conta o que você procura e até quanto quer pagar. A Lana responde até as {proximo_bloco}.';
export const TEXTO_FALAR_LANA = 'Combinado, avisei a Lana. Ela responde até as {proximo_bloco}.';

// ---- regras de palavra-chave ----

/** Nível 4 com palavra-chave conhecida: notificação imediata (Fluxo D, passo 3). */
const URGENTE: Array<{ motivo: string; re: RegExp }> = [
  { motivo: 'reclamação séria', re: /\b(procon|reclame ?aqui|processar|processo|advogad\w*|golpe\w*|fraude|enganad\w*|denunci\w*|policia)\b/ },
  { motivo: 'proposta de parceria', re: /\b(parceria\w*|patrocin\w*|publipost|publi|permuta|collab|minha loja|nossa loja|minha marca|nossa marca)\b/ },
  { motivo: 'ofensa', re: /\b(idiota|otari\w*|lixo|vagabund\w*|porra|caralho|merda|fdp|puta|imbecil|safad\w*)\b/ },
];

const NIVEL1: Array<{ categoria: CategoriaNivel1; re: RegExp }> = [
  { categoria: 'link', re: /\blink\b.*\b(nao|n)\b.*\b(abre|abriu|funciona|funcionou|carrega)\b|\b(nao|n) (abre|abriu|carrega) o link\b/ },
  { categoria: 'cupom', re: /\bcupo(m|ns|ns)\b/ },
  { categoria: 'oferta_vale', re: /\b(ainda (vale|valendo|ta valendo|esta valendo|tem)|acabou a oferta|esgot\w*|ainda esta nesse preco|ainda ta nesse preco)\b/ },
  { categoria: 'entrega', re: /\b(entrega|nao chegou|rastre\w*|reembols\w*|devoluc\w*|devolver)\b/ },
  { categoria: 'como_funciona', re: /\b(como funciona|o que e (o|a|esse|essa) (canal|precinho)|voces ganham|e confiavel)\b/ },
];

/** Mensagens longas não recebem resposta automática por palavra-chave: vão para o ciclo [SUPOSIÇÃO]. */
export const MAX_CARACTERES_NIVEL1_AUTOMATICO = 160;

export type Triagem =
  | { nivel: 4; motivo: string }
  | { nivel: 1; categoria: CategoriaNivel1 }
  | { nivel: null }; // vai para o próximo ciclo da Atendente

/** Triagem na chegada (código, sem IA): nível 4 por palavra-chave, nível 1 por palavra-chave. */
export function triar(texto: string): Triagem {
  const t = normalizar(texto);
  for (const u of URGENTE) if (u.re.test(t)) return { nivel: 4, motivo: u.motivo };
  if (t.length <= MAX_CARACTERES_NIVEL1_AUTOMATICO) {
    for (const r of NIVEL1) if (r.re.test(t)) return { nivel: 1, categoria: r.categoria };
  }
  return { nivel: null };
}

/** Preenche campos {nome} de um texto fixo. Campo sem valor fica fora (erro), nunca inventado. */
export function preencher(modelo: string, campos: Record<string, string>): string {
  return modelo.replace(/\{([a-z_]+)\}/g, (m, k: string) => {
    if (!(k in campos)) throw new Error(`campo sem valor no texto fixo: ${m}`);
    return campos[k];
  });
}
