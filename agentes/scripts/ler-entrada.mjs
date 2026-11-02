// Busca a entrada de um trabalho grande (Anexo A.4, passo 7).
// Uso: node scripts/ler-entrada.mjs <payload.json> > /tmp/entrada.json
import fs from 'node:fs';

const arq = process.argv[2];
if (!arq) {
  console.error('uso: node scripts/ler-entrada.mjs <payload.json>');
  process.exit(2);
}
const payload = JSON.parse(fs.readFileSync(arq, 'utf8'));
if (payload.entrada !== undefined) {
  process.stdout.write(JSON.stringify(payload.entrada, null, 2));
  process.exit(0);
}
if (typeof payload.leitura !== 'string') {
  console.error('payload sem "entrada" e sem "leitura"');
  process.exit(1);
}
const headers = { 'content-type': 'application/json' };
if (process.env.AGENT_CALLBACK_TOKEN) headers.Authorization = `Bearer ${process.env.AGENT_CALLBACK_TOKEN}`;
const resp = await fetch(payload.leitura, { method: 'POST', headers, body: JSON.stringify({ job_id: payload.job_id, nonce: payload.nonce }) });
const corpo = await resp.json().catch(() => ({}));
if (!resp.ok) {
  console.error(`Leitura recusada (${resp.status}): ${JSON.stringify(corpo)}`);
  process.exit(1);
}
process.stdout.write(JSON.stringify(corpo.entrada, null, 2));
