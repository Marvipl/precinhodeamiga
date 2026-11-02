// Monta o conteúdo do repositório `precinho-agentes` (Anexo A.5) como um mapa caminho -> conteúdo.
// Código puro sobre os arquivos lidos: quem grava no disco é scripts/gerar-agentes.ts.
import type { Contrato } from '../../supabase/functions/_shared/core/contratos/index.ts';
import { ROTINAS, type IdRotina } from '../../supabase/functions/_shared/core/agentes.ts';
import { esquemaDoContrato, slugContrato } from './esquemas.ts';
import type { ArquivoAvaliacao } from './avaliar.ts';

/** Arquivo de instrução principal de cada rotina (agentes/<nome>.md). */
export const ARQUIVO_DA_ROTINA: Record<IdRotina, string> = {
  'pa-curadoria': 'cacadora',
  'pa-redacao': 'redatora',
  'pa-atendente': 'atendente',
  'pa-analista': 'analista',
  'pa-radar': 'radar',
  'pa-coach': 'coach',
};

export function instrucaoDaRotina(rotina: IdRotina): string {
  return `Execute o trabalho do bloco \`<routine-fire-payload>\` seguindo \`agentes/${ARQUIVO_DA_ROTINA[rotina]}.md\`.`;
}

export interface FontesAgentes {
  /** Arquivos de `agentes/` (caminho relativo -> conteúdo), sem a pasta `avaliacoes/`. */
  arquivos: Record<string, string>;
  contratos: Contrato[];
  avaliacoes: ArquivoAvaliacao[];
}

export const MARCADOR = '.gerado-por-precinhodeamiga';

function json(v: unknown): string {
  return JSON.stringify(v, null, 2) + '\n';
}

export function montarRepositorio(f: FontesAgentes): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [caminho, conteudo] of Object.entries(f.arquivos)) {
    if (caminho.startsWith('avaliacoes/') || caminho.endsWith('.d.mts')) continue; // avaliações ficam fora do alcance dos agentes
    out[caminho] = conteudo;
  }

  const contratos = [...f.contratos].sort((a, b) => a.id.localeCompare(b.id));
  for (const c of contratos) {
    const slug = slugContrato(c.id);
    out[`contratos/${slug}.schema.json`] = json(esquemaDoContrato(c));
    const caso = f.avaliacoes.find((a) => a.contrato === c.id)?.casos[0];
    if (caso) {
      out[`contratos/${slug}.exemplo.json`] = json({
        $comment: 'Exemplo com dados fictícios. A saída é a resposta gravada do modo simulado.',
        entrada: caso.entrada,
        saida: c.simular(caso.entrada),
      });
    }
  }

  const linhas = contratos.map((c) => `| \`${c.id}\` | ${c.rotina} | \`agentes/${ARQUIVO_DA_ROTINA[c.rotina]}.md\` | ${c.descricao} |`);
  out['contratos/INDICE.md'] = [
    '# Contratos',
    '',
    'Gerado a partir de `core/contratos`. A saída de cada trabalho precisa passar no esquema `saida` do arquivo `.schema.json`.',
    '',
    '| Contrato | Rotina | Instrução | Descrição |',
    '|---|---|---|---|',
    ...linhas,
    '',
  ].join('\n');

  const rotinas = (Object.keys(ROTINAS) as IdRotina[]).map((r) => {
    const cs = contratos.filter((c) => c.rotina === r).map((c) => `\`${c.id}\``);
    return [
      `## ${r}`,
      '',
      `Agentes: ${ROTINAS[r].agentes.join(', ')}. Teto por dia: ${ROTINAS[r].tetoDiario}. Contratos: ${cs.length ? cs.join(', ') : 'nenhum ainda'}.`,
      '',
      'Instrução fixa:',
      '',
      '```',
      instrucaoDaRotina(r),
      '```',
      '',
    ].join('\n');
  });
  out['ROTINAS.md'] = [
    '# Rotinas',
    '',
    'Crie cada rotina em claude.ai/code/routines com este repositório, o ambiente de nuvem da Precinho e um gatilho de API. Cole a instrução fixa abaixo. O token do gatilho aparece uma vez: guarde como `ROUTINE_<NOME>_TOKEN` nos segredos do Supabase.',
    '',
    ...rotinas,
  ].join('\n');

  out[MARCADOR] = 'Pasta gerada por `npm run agentes:gerar` no repositório precinhodeamiga. Não edite à mão.\n';
  return out;
}
