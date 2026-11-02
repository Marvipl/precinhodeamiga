// Envia o resultado de um trabalho ao endpoint de retorno (Anexo A.4, passo 4).
// Uso: node scripts/enviar-resultado.mjs <payload.json> <saida.json> [--so-validar]
// - payload.json: o JSON do bloco <routine-fire-payload> (contrato, job_id, nonce, retorno).
// - saida.json: só o objeto da saída, no formato de contratos/<contrato>.schema.json.
// Valida antes de enviar: uma saída fora do contrato marca o trabalho como erro, sem segunda chance.
// O token vem do segredo de rede (variável AGENT_CALLBACK_TOKEN, se existir). Nunca grave o token em arquivo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validarContra } from './validar.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function arquivoDoContrato(id) {
  return path.join(raiz, 'contratos', `${String(id).replace(/[^a-z0-9-]+/gi, '-')}.schema.json`);
}

function sair(msg, codigo = 1) {
  console.error(msg);
  process.exit(codigo);
}

const args = process.argv.slice(2);
const soValidar = args.includes('--so-validar');
const [arqPayload, arqSaida] = args.filter((a) => !a.startsWith('--'));
if (!arqPayload || !arqSaida) sair('uso: node scripts/enviar-resultado.mjs <payload.json> <saida.json> [--so-validar]', 2);

const payload = JSON.parse(fs.readFileSync(arqPayload, 'utf8'));
const saida = JSON.parse(fs.readFileSync(arqSaida, 'utf8'));
for (const campo of ['contrato', 'job_id', 'nonce', 'retorno']) {
  if (typeof payload[campo] !== 'string' || !payload[campo]) sair(`payload sem "${campo}"`);
}

const arqContrato = arquivoDoContrato(payload.contrato);
if (!fs.existsSync(arqContrato)) sair(`contrato desconhecido neste repositório: ${payload.contrato}. Não envie; avise no fim da sessão.`);
const erros = validarContra(JSON.parse(fs.readFileSync(arqContrato, 'utf8')), saida, 'saida');
if (erros.length) sair(`Saída fora do contrato ${payload.contrato}. Corrija e rode de novo:\n- ${erros.join('\n- ')}`);
if (soValidar) {
  console.log(`Saída válida para ${payload.contrato}. Nada foi enviado.`);
  process.exit(0);
}

const url = new URL(payload.retorno);
if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') sair('endpoint de retorno precisa ser https');

const headers = { 'content-type': 'application/json' };
const token = process.env.AGENT_CALLBACK_TOKEN;
if (token) headers.Authorization = `Bearer ${token}`;

let ultimoErro = '';
for (let tentativa = 1; tentativa <= 3; tentativa++) {
  try {
    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ job_id: payload.job_id, nonce: payload.nonce, saida }) });
    const texto = await resp.text();
    if (resp.ok) {
      console.log(`Resultado aceito (${resp.status}): ${texto}`);
      process.exit(0);
    }
    // 4xx é definitivo: não adianta repetir.
    if (resp.status < 500) sair(`Resultado recusado (${resp.status}): ${texto}`);
    ultimoErro = `${resp.status}: ${texto}`;
  } catch (e) {
    ultimoErro = e instanceof Error ? e.message : String(e);
  }
  await new Promise((r) => setTimeout(r, 2000 * tentativa));
}
sair(`Falha ao enviar depois de 3 tentativas: ${ultimoErro}`);
