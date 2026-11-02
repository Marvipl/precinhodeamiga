// Gera a pasta do repositório `precinho-agentes` (Anexo A.5).
// Uso: npm run agentes:gerar [-- <pasta de saída>]   (padrão: build/precinho-agentes)
// Pode apontar para um clone do repositório precinho-agentes: a pasta .git é preservada.
import fs from 'node:fs';
import path from 'node:path';
import { lerFontes, RAIZ } from './agentes/fontes.ts';
import { MARCADOR, montarRepositorio } from './agentes/montar.ts';

const destino = path.resolve(process.argv[2] ?? path.join(RAIZ, 'build', 'precinho-agentes'));

if (fs.existsSync(destino)) {
  const itens = fs.readdirSync(destino).filter((n) => n !== '.git');
  if (itens.length > 0 && !fs.existsSync(path.join(destino, MARCADOR))) {
    console.error(`A pasta ${destino} tem arquivos que não foram gerados por este script. Escolha uma pasta vazia ou um clone do precinho-agentes.`);
    process.exit(1);
  }
  for (const n of itens) fs.rmSync(path.join(destino, n), { recursive: true, force: true });
}

const arquivos = montarRepositorio(lerFontes());
for (const [rel, conteudo] of Object.entries(arquivos)) {
  const p = path.join(destino, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, conteudo);
}
console.log(`${Object.keys(arquivos).length} arquivos gerados em ${destino}`);
