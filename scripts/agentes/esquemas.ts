// JSON Schema dos contratos (Anexo A.5): gerado a partir dos esquemas zod que o endpoint de retorno usa.
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import type { Contrato } from '../../supabase/functions/_shared/core/contratos/index.ts';

export interface EsquemaContrato {
  $comment: string;
  contrato: string;
  rotina: string;
  descricao: string;
  entrada: Record<string, unknown>;
  saida: Record<string, unknown>;
}

export function slugContrato(id: string): string {
  return id.replace(/[^a-z0-9-]+/gi, '-');
}

export function paraJsonSchema(esquema: z.ZodTypeAny): Record<string, unknown> {
  const js = zodToJsonSchema(esquema, { target: 'jsonSchema7', $refStrategy: 'none' }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

export function esquemaDoContrato(c: Contrato): EsquemaContrato {
  return {
    $comment: 'Gerado por scripts/gerar-agentes.ts a partir de core/contratos. Não edite à mão. O endpoint de retorno valida com o mesmo esquema (zod).',
    contrato: c.id,
    rotina: c.rotina,
    descricao: c.descricao,
    entrada: paraJsonSchema(c.entrada as z.ZodTypeAny),
    saida: paraJsonSchema(c.saida as z.ZodTypeAny),
  };
}
