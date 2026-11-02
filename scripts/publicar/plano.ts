// Regras puras da publicação automática no Supabase (workflow "Publicar no Supabase").
// Aqui só se decide o que enviar; quem fala com a rede é `executar.ts`.
import crypto from 'node:crypto';

/** Segredos que o dono guarda no GitHub (Settings > Secrets) e são copiados para as Edge Functions. */
export const SEGREDOS_DO_GITHUB = [
  'SHOPEE_AFFILIATE_APP_ID',
  'SHOPEE_AFFILIATE_APP_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHANNEL_ID',
  'TELEGRAM_LANA_CHAT_ID',
  ...['CURADORIA', 'REDACAO', 'ATENDENTE', 'ANALISTA', 'RADAR', 'COACH'].flatMap((r) => [
    `ROUTINE_${r}_ID`,
    `ROUTINE_${r}_TOKEN`,
  ]),
] as const;

/** Valores não secretos que o dono guarda no GitHub (Settings > Variables). */
export const VARIAVEIS_DO_GITHUB = [
  'AGENTES_MODO',
  'NOTIFICACOES_MODO',
  'SHOPEE_MODO',
  'TELEGRAM_MODO',
  'VAPID_SUBJECT',
] as const;

export type Segredo = { name: string; value: string };

/** Token aleatório longo, seguro para cabeçalho HTTP e para o secret_token do Telegram. */
export function gerarToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Par VAPID (P-256) no formato do web-push: pública não comprimida e privada, ambas base64url. */
export function gerarVapid(): { publica: string; privada: string } {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    publica: ecdh.getPublicKey().toString('base64url'),
    privada: ecdh.getPrivateKey().toString('base64url'),
  };
}

/** Tira barra final e exige https. Devolve undefined se vazio ou inválido. */
export function normalizarUrlSite(valor: string | undefined): string | undefined {
  const v = (valor ?? '').trim().replace(/\/+$/, '');
  if (!v) return undefined;
  if (!/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(v)) return undefined;
  return v;
}

/**
 * Monta a lista de segredos a gravar nas Edge Functions.
 * - Copia do GitHub o que estiver preenchido (nunca apaga o que não veio).
 * - PUBLIC_SITE_URL alimenta também SITE_URL (as funções usam os dois nomes).
 * - Gera AGENT_CALLBACK_TOKEN e o par VAPID só quando ainda não existem no Supabase.
 */
export function planejarSegredos(
  ambiente: Record<string, string | undefined>,
  existentes: ReadonlySet<string>,
  gerar: { token: () => string; vapid: () => { publica: string; privada: string } } = {
    token: gerarToken,
    vapid: gerarVapid,
  },
): { segredos: Segredo[]; vapidPublicaNova?: string } {
  const segredos: Segredo[] = [];
  for (const nome of [...SEGREDOS_DO_GITHUB, ...VARIAVEIS_DO_GITHUB]) {
    const v = (ambiente[nome] ?? '').trim();
    if (v) segredos.push({ name: nome, value: v });
  }
  const site = normalizarUrlSite(ambiente.PUBLIC_SITE_URL);
  if (site) {
    segredos.push({ name: 'PUBLIC_SITE_URL', value: site });
    segredos.push({ name: 'SITE_URL', value: site });
  }
  if (!existentes.has('AGENT_CALLBACK_TOKEN')) {
    segredos.push({ name: 'AGENT_CALLBACK_TOKEN', value: gerar.token() });
  }
  let vapidPublicaNova: string | undefined;
  if (!existentes.has('VAPID_PRIVATE_KEY') || !existentes.has('VAPID_PUBLIC_KEY')) {
    const par = gerar.vapid();
    segredos.push({ name: 'VAPID_PUBLIC_KEY', value: par.publica });
    segredos.push({ name: 'VAPID_PRIVATE_KEY', value: par.privada });
    vapidPublicaNova = par.publica;
  }
  return { segredos, vapidPublicaNova };
}

function literal(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** SQL idempotente que grava `project_url` e `service_role_key` no Vault (usados pelo pg_cron). */
export function sqlVault(projectUrl: string, serviceRoleKey: string): string {
  const um = (nome: string, valor: string) => `
  select id into i from vault.secrets where name = ${literal(nome)};
  if i is null then perform vault.create_secret(${literal(valor)}, ${literal(nome)});
  else perform vault.update_secret(i, ${literal(valor)}); end if;`;
  return `do $$ declare i uuid; begin${um('project_url', projectUrl)}${um('service_role_key', serviceRoleKey)}
end $$;`;
}

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

export function normalizarEmail(valor: string | undefined): string | undefined {
  const v = (valor ?? '').trim().toLowerCase();
  return EMAIL.test(v) ? v : undefined;
}

export type Acesso = { email: string; papel: 'operadora' | 'dono'; nome: string };

/** Lista de acessos a liberar a partir das entradas do workflow; e-mails inválidos são recusados. */
export function planejarAcessos(entradas: { emailLana?: string; emailMarcus?: string }): {
  acessos: Acesso[];
  erros: string[];
} {
  const acessos: Acesso[] = [];
  const erros: string[] = [];
  const pares: [string | undefined, Acesso['papel'], string][] = [
    [entradas.emailLana, 'operadora', 'Lana'],
    [entradas.emailMarcus, 'dono', 'Marcus'],
  ];
  for (const [bruto, papel, nome] of pares) {
    if (!bruto || !bruto.trim()) continue;
    const email = normalizarEmail(bruto);
    if (email) acessos.push({ email, papel, nome });
    else erros.push(`E-mail inválido para ${nome}.`);
  }
  return { acessos, erros };
}

export function sqlAcessos(acessos: Acesso[]): string {
  if (acessos.length === 0) return '';
  const linhas = acessos.map((a) => `(${literal(a.email)}, ${literal(a.papel)}, ${literal(a.nome)})`).join(',\n  ');
  return `insert into acesso_permitido (email, papel, nome) values
  ${linhas}
on conflict (email) do update set papel = excluded.papel, nome = excluded.nome;`;
}

/** Comandos do bot (Atendente) cadastrados no BotFather via setMyCommands. */
export const COMANDOS_DO_BOT = [
  { command: 'start', description: 'Começar' },
  { command: 'menu', description: 'Ver as opções' },
  { command: 'privacidade', description: 'Como usamos seus dados' },
  { command: 'apagar', description: 'Apagar seus dados' },
];

export const ATUALIZACOES_DO_WEBHOOK = ['message', 'callback_query', 'chat_member', 'my_chat_member'];

export function urlDoWebhook(ref: string): string {
  return `https://${ref}.supabase.co/functions/v1/telegram-webhook`;
}
