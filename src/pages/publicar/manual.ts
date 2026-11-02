// F-16 Post manual: validação do formulário antes de chamar a função `post-manual`.
// O servidor monta o texto no formato padrão, passa pela Guardiã e agenda, como num post normal.
// Aqui só se confere o que a Lana digitou; o "de" só aparece se a Guardiã liberar (seção 5.2).
import { instanteLocal } from '@core/formato.ts';
import type { Canal } from './estado';

export interface FormPostManual {
  link_afiliado: string;
  titulo: string;
  preco_atual: string;
  preco_referencia: string;
  cupom: string;
  prazo_data: string; // AAAA-MM-DD
  prazo_hora: string; // HH:MM
  frase: string;
  canais: Canal[];
}

export const FORM_VAZIO: FormPostManual = {
  link_afiliado: '',
  titulo: '',
  preco_atual: '',
  preco_referencia: '',
  cupom: '',
  prazo_data: '',
  prazo_hora: '',
  frase: '',
  canais: ['wa', 'tg'],
};

export interface CorpoPostManual {
  link_afiliado: string;
  titulo: string;
  preco_atual: number;
  preco_referencia: number | null;
  cupom: string | null;
  prazo: string | null;
  frase: string | null;
  canais: Canal[];
}

/** "39,90", "1.299,00", "R$ 12" ou "12.5" viram número. Vazio ou inválido vira null. */
export function lerReais(texto: string): number | null {
  let t = texto.replace(/R\$\s?/i, '').replace(/\s/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function validarPostManual(
  f: FormPostManual,
  limites: { fraseMax: number },
): { ok: true; corpo: CorpoPostManual } | { ok: false; erros: Partial<Record<keyof FormPostManual, string>> } {
  const erros: Partial<Record<keyof FormPostManual, string>> = {};
  const link = f.link_afiliado.trim();
  if (!link) erros.link_afiliado = 'Cole o link de afiliado que você gerou no painel da Shopee.';
  else if (!/^https:\/\/\S+$/.test(link)) erros.link_afiliado = 'O link precisa começar com https:// e não pode ter espaços.';

  const titulo = f.titulo.trim().replace(/\s+/g, ' ');
  if (!titulo) erros.titulo = 'Escreva o nome do produto.';
  else if (titulo.length > 120) erros.titulo = 'Use até 120 caracteres.';

  const preco = lerReais(f.preco_atual);
  if (preco === null || preco <= 0) erros.preco_atual = 'Informe o preço atual, por exemplo 39,90.';

  let referencia: number | null = null;
  if (f.preco_referencia.trim()) {
    referencia = lerReais(f.preco_referencia);
    if (referencia === null || referencia <= 0) erros.preco_referencia = 'Preço "de" inválido. Deixe vazio se não souber.';
    else if (preco !== null && referencia <= preco) erros.preco_referencia = 'O preço "de" precisa ser maior que o atual.';
  }

  const cupom = f.cupom.trim();
  if (cupom.length > 40) erros.cupom = 'Use até 40 caracteres.';

  let prazo: string | null = null;
  if (f.prazo_data) {
    const d = instanteLocal(f.prazo_data, f.prazo_hora || '23:59');
    if (Number.isNaN(d.getTime())) erros.prazo_data = 'Data inválida.';
    else if (d.getTime() <= Date.now()) erros.prazo_data = 'O prazo já passou.';
    else prazo = d.toISOString();
  } else if (f.prazo_hora) {
    erros.prazo_data = 'Informe também o dia do prazo.';
  }

  const frase = f.frase.trim();
  if (frase.length > limites.fraseMax) erros.frase = `Use até ${limites.fraseMax} caracteres.`;

  if (f.canais.length === 0) erros.canais = 'Marque pelo menos um canal.';

  if (Object.keys(erros).length > 0) return { ok: false, erros };
  return {
    ok: true,
    corpo: {
      link_afiliado: link,
      titulo,
      preco_atual: preco as number,
      preco_referencia: referencia,
      cupom: cupom || null,
      prazo,
      frase: frase || null,
      canais: [...new Set(f.canais)],
    },
  };
}
