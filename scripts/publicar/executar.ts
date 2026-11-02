// Etapas da publicação automática no Supabase, chamadas pelo workflow `.github/workflows/publicar-supabase.yml`.
// Uso: node scripts/publicar/executar.ts <segredos|vault|auth|acessos|telegram>
// Lê SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF do ambiente; nunca imprime valores secretos.
import fs from 'node:fs';
import {
  ATUALIZACOES_DO_WEBHOOK,
  COMANDOS_DO_BOT,
  gerarToken,
  normalizarUrlSite,
  planejarAcessos,
  planejarSegredos,
  sqlAcessos,
  sqlVault,
  urlDoWebhook,
  type Segredo,
} from './plano.ts';

const API = 'https://api.supabase.com/v1';
const token = process.env.SUPABASE_ACCESS_TOKEN ?? '';
const ref = process.env.SUPABASE_PROJECT_REF ?? '';
if (!token || !ref) {
  console.error('Faltam SUPABASE_ACCESS_TOKEN e/ou SUPABASE_PROJECT_REF nos segredos do GitHub.');
  process.exit(1);
}
const projectUrl = `https://${ref}.supabase.co`;

function mascarar(valor: string) {
  if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${valor}`);
}

function resumo(texto: string) {
  const arq = process.env.GITHUB_STEP_SUMMARY;
  if (arq) fs.appendFileSync(arq, texto + '\n');
  console.log(texto);
}

async function api(caminho: string, init: RequestInit = {}): Promise<unknown> {
  const r = await fetch(`${API}${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const corpo = await r.text();
  if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${caminho} falhou (${r.status}): ${corpo.slice(0, 300)}`);
  return corpo ? JSON.parse(corpo) : null;
}

async function sql(query: string) {
  return api(`/projects/${ref}/database/query`, { method: 'POST', body: JSON.stringify({ query }) });
}

async function nomesDosSegredos(): Promise<Set<string>> {
  const lista = (await api(`/projects/${ref}/secrets`)) as { name: string }[];
  return new Set(lista.map((s) => s.name));
}

async function gravarSegredos(segredos: Segredo[]) {
  if (segredos.length === 0) return;
  for (const s of segredos) mascarar(s.value);
  await api(`/projects/${ref}/secrets`, { method: 'POST', body: JSON.stringify(segredos) });
}

async function chaveDeServico(): Promise<string> {
  const chaves = (await api(`/projects/${ref}/api-keys?reveal=true`)) as { name: string; api_key: string }[];
  const k = chaves.find((c) => c.name === 'service_role')?.api_key;
  if (!k) throw new Error('Não achei a chave service_role do projeto.');
  mascarar(k);
  return k;
}

async function etapaSegredos() {
  const existentes = await nomesDosSegredos();
  const { segredos, vapidPublicaNova } = planejarSegredos(process.env, existentes);
  await gravarSegredos(segredos);
  resumo(`### Segredos das funções\nGravados: ${segredos.map((s) => '`' + s.name + '`').join(', ') || 'nenhum'}`);
  if (vapidPublicaNova) {
    resumo(
      `\n### Chave pública VAPID (nova)\nCopie para o Netlify como \`VITE_VAPID_PUBLIC_KEY\` (ela é pública, pode ficar visível):\n\n\`\`\`\n${vapidPublicaNova}\n\`\`\``,
    );
  }
}

async function etapaVault() {
  await sql(sqlVault(projectUrl, await chaveDeServico()));
  resumo('### Vault\n`project_url` e `service_role_key` gravados (o pg_cron já consegue chamar as funções).');
}

async function etapaAuth() {
  const site = normalizarUrlSite(process.env.PUBLIC_SITE_URL);
  const corpo: Record<string, unknown> = { disable_signup: true };
  if (site) {
    corpo.site_url = site;
    corpo.uri_allow_list = `${site},${site}/**`;
  }
  await api(`/projects/${ref}/config/auth`, { method: 'PATCH', body: JSON.stringify(corpo) });
  resumo(`### Login\nCadastro aberto desligado.${site ? ` Site URL: ${site}` : ' (Site URL fica para quando PUBLIC_SITE_URL existir.)'}`);
}

async function etapaAcessos() {
  const { acessos, erros } = planejarAcessos({
    emailLana: process.env.EMAIL_LANA,
    emailMarcus: process.env.EMAIL_MARCUS,
  });
  if (erros.length) throw new Error(erros.join(' '));
  if (acessos.length === 0) {
    resumo('### Acessos\nNenhum e-mail informado; nada a fazer.');
    return;
  }
  await sql(sqlAcessos(acessos));
  const chave = await chaveDeServico();
  const site = normalizarUrlSite(process.env.PUBLIC_SITE_URL);
  const linhas: string[] = [];
  for (const a of acessos) {
    const r = await fetch(`${projectUrl}/auth/v1/invite`, {
      method: 'POST',
      headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: a.email, ...(site ? { redirect_to: site } : {}) }),
    });
    const texto = await r.text();
    if (r.ok) linhas.push(`- ${a.nome}: convite enviado`);
    else if (/already been registered|already registered|email_exists/i.test(texto)) linhas.push(`- ${a.nome}: já tinha conta`);
    else throw new Error(`Convite de ${a.nome} falhou (${r.status}): ${texto.slice(0, 200)}`);
  }
  resumo(`### Acessos\n${linhas.join('\n')}`);
}

async function telegram(metodo: string, corpo: unknown) {
  const bot = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const r = await fetch(`https://api.telegram.org/bot${bot}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const j = (await r.json()) as { ok: boolean; description?: string };
  if (!j.ok) throw new Error(`Telegram ${metodo} falhou: ${j.description ?? r.status}`);
}

async function etapaTelegram() {
  const bot = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  if (!bot) {
    resumo('### Telegram\nSem `TELEGRAM_BOT_TOKEN` no GitHub; o bot segue no modo simulado.');
    return;
  }
  mascarar(bot);
  const existentes = await nomesDosSegredos();
  const refazer = process.env.REFAZER_WEBHOOK === 'true';
  if (refazer || !existentes.has('TELEGRAM_WEBHOOK_SECRET')) {
    const segredo = gerarToken(24);
    await gravarSegredos([{ name: 'TELEGRAM_WEBHOOK_SECRET', value: segredo }]);
    await telegram('setWebhook', {
      url: urlDoWebhook(ref),
      secret_token: segredo,
      allowed_updates: ATUALIZACOES_DO_WEBHOOK,
    });
    resumo('### Telegram\nWebhook registrado apontando para `telegram-webhook`.');
  } else {
    resumo('### Telegram\nWebhook já estava registrado (marque "refazer webhook" para registrar de novo).');
  }
  await telegram('setMyCommands', { commands: COMANDOS_DO_BOT });
  resumo('Comandos /start, /menu, /privacidade e /apagar cadastrados.');
}

const etapas: Record<string, () => Promise<void>> = {
  segredos: etapaSegredos,
  vault: etapaVault,
  auth: etapaAuth,
  acessos: etapaAcessos,
  telegram: etapaTelegram,
};

const nome = process.argv[2] ?? '';
const etapa = etapas[nome];
if (!etapa) {
  console.error(`Etapa desconhecida: "${nome}". Use: ${Object.keys(etapas).join(', ')}.`);
  process.exit(1);
}
try {
  await etapa();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
