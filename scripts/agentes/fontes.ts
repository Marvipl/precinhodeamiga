// Lê do disco as fontes do repositório dos agentes (pasta `agentes/` e contratos registrados).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTRATOS } from '../../supabase/functions/_shared/core/contratos/index.ts';
import type { ArquivoAvaliacao } from './avaliar.ts';
import type { FontesAgentes } from './montar.ts';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PASTA_AGENTES = path.join(RAIZ, 'agentes');

function listar(dir: string, base = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listar(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

export function lerAvaliacoes(pasta = path.join(PASTA_AGENTES, 'avaliacoes')): ArquivoAvaliacao[] {
  if (!fs.existsSync(pasta)) return [];
  return fs
    .readdirSync(pasta)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => JSON.parse(fs.readFileSync(path.join(pasta, n), 'utf8')) as ArquivoAvaliacao);
}

export function lerFontes(): FontesAgentes {
  const arquivos: Record<string, string> = {};
  for (const rel of listar(PASTA_AGENTES)) arquivos[rel] = fs.readFileSync(path.join(PASTA_AGENTES, rel), 'utf8');
  return { arquivos, contratos: CONTRATOS, avaliacoes: lerAvaliacoes() };
}
