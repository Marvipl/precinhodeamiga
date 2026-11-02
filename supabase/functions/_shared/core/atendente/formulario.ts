// Validação do formulário "Fale com a Precinho" (seção 4.3). Mesmo esquema no site e na função.
import { z } from 'zod';
import { celularValido } from './regras.ts';

export const formularioFale = z
  .object({
    texto: z.string().trim().min(3, 'Conte o que você procura ou a sua dúvida.').max(1000, 'Use até 1.000 caracteres.'),
    preco_max: z.number().positive().max(100_000).nullable().optional(),
    primeiro_nome: z.string().trim().max(40).nullable().optional(),
    preferencia: z.enum(['canal', 'whatsapp']),
    whatsapp: z.string().trim().max(30).nullable().optional(),
    consentimento_whatsapp: z.boolean().optional(),
    /** Campo isca: pessoas não veem, robôs preenchem. */
    site: z.string().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.preferencia !== 'whatsapp') return;
    if (!v.whatsapp || !celularValido(v.whatsapp)) ctx.addIssue({ code: 'custom', path: ['whatsapp'], message: 'Informe um celular com DDD.' });
    if (v.consentimento_whatsapp !== true)
      ctx.addIssue({ code: 'custom', path: ['consentimento_whatsapp'], message: 'Para responder pelo WhatsApp, precisamos do seu consentimento.' });
  });

export type FormularioFale = z.infer<typeof formularioFale>;
