// Roda as avaliações dos agentes (Anexo A.6).
// Uso:
//   npm run agentes:avaliar                          -> contra as respostas simuladas
//   npm run agentes:avaliar -- --respostas <pasta>   -> contra respostas reais em <pasta>/<contrato>/<caso>.json
import fs from 'node:fs';
import path from 'node:path';
import { contrato } from '../supabase/functions/_shared/core/contratos/index.ts';
import { avaliarCaso, type ResultadoCaso } from './agentes/avaliar.ts';
import { slugContrato } from './agentes/esquemas.ts';
import { lerAvaliacoes } from './agentes/fontes.ts';

const i = process.argv.indexOf('--respostas');
const pastaRespostas = i >= 0 ? path.resolve(process.argv[i + 1] ?? '') : null;

const resultados: ResultadoCaso[] = [];
for (const arq of lerAvaliacoes()) {
  const c = contrato(arq.contrato);
  if (!c) {
    console.log(`- ${arq.contrato}: contrato ainda não registrado, avaliação ignorada`);
    continue;
  }
  for (const caso of arq.casos) {
    let saida: unknown;
    if (pastaRespostas) {
      const p = path.join(pastaRespostas, slugContrato(c.id), `${caso.nome}.json`);
      if (!fs.existsSync(p)) {
        resultados.push({ contrato: c.id, caso: caso.nome, falhas: [`sem resposta em ${p}`] });
        continue;
      }
      saida = JSON.parse(fs.readFileSync(p, 'utf8'));
    } else saida = c.simular(caso.entrada);
    resultados.push(avaliarCaso(c, caso, saida));
  }
}

let falhou = 0;
for (const r of resultados) {
  if (r.falhas.length === 0) console.log(`ok    ${r.contrato} / ${r.caso}`);
  else {
    falhou++;
    console.log(`falha ${r.contrato} / ${r.caso}\n      - ${r.falhas.join('\n      - ')}`);
  }
}
console.log(`\n${resultados.length - falhou} de ${resultados.length} casos aprovados (${pastaRespostas ? 'respostas reais' : 'respostas simuladas'}).`);
process.exit(falhou > 0 ? 1 : 0);
