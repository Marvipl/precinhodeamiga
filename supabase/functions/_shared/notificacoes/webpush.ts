// Web Push sem dependências: VAPID (RFC 8292) e criptografia aes128gcm (RFC 8291), só com WebCrypto.
// Roda no Deno (Edge Functions) e no Node 20+ (testes). Não usa Deno.*.

const enc = new TextEncoder();

export function b64urlParaBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesParaB64url(b: Uint8Array): string {
  let bin = '';
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function juntar(...partes: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

// WebCrypto pede ArrayBuffer "puro"; copiar evita problemas de tipo com Uint8Array<ArrayBufferLike>.
function buf(b: Uint8Array): ArrayBuffer {
  return b.slice().buffer as ArrayBuffer;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const chave = await crypto.subtle.importKey('raw', buf(ikm), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(info) }, chave, bytes * 8);
  return new Uint8Array(bits);
}

export interface ChavesVapid {
  /** Chave pública P-256 sem compressão (65 bytes), base64url, como gera `npx web-push generate-vapid-keys`. */
  publica: string;
  /** Escalar privado (32 bytes), base64url. */
  privada: string;
  /** "mailto:..." ou "https://..." de contato (exigido pelos serviços de push). */
  assunto: string;
}

export interface InscricaoPush {
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function chavePrivadaVapid(v: ChavesVapid): Promise<CryptoKey> {
  const pub = b64urlParaBytes(v.publica);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY inválida');
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: v.privada,
    x: bytesParaB64url(pub.slice(1, 33)),
    y: bytesParaB64url(pub.slice(33, 65)),
    ext: false,
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** Cabeçalho `Authorization: vapid t=..., k=...` para o endpoint informado. */
export async function cabecalhoVapid(endpoint: string, v: ChavesVapid, agora = new Date()): Promise<string> {
  const aud = new URL(endpoint).origin;
  const cab = bytesParaB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const exp = Math.floor(agora.getTime() / 1000) + 12 * 3600;
  const corpo = bytesParaB64url(enc.encode(JSON.stringify({ aud, exp, sub: v.assunto })));
  const assinatura = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await chavePrivadaVapid(v), buf(enc.encode(`${cab}.${corpo}`)));
  return `vapid t=${cab}.${corpo}.${bytesParaB64url(new Uint8Array(assinatura))}, k=${v.publica}`;
}

const TAMANHO_REGISTRO = 4096;

/**
 * Cifra a mensagem para a inscrição (aes128gcm, um registro só).
 * `efemera` e `salt` só são passados nos testes; em produção são aleatórios.
 */
export async function cifrar(
  mensagem: Uint8Array,
  inscricao: Pick<InscricaoPush, 'p256dh' | 'auth'>,
  opcoes: { efemera?: CryptoKeyPair; salt?: Uint8Array } = {},
): Promise<Uint8Array> {
  const uaPublica = b64urlParaBytes(inscricao.p256dh);
  const segredo = b64urlParaBytes(inscricao.auth);
  if (uaPublica.length !== 65) throw new Error('p256dh inválido');
  if (mensagem.length > TAMANHO_REGISTRO - 16 - 1 - 86) throw new Error('mensagem grande demais para um registro');

  const efemera =
    opcoes.efemera ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublica = new Uint8Array(await crypto.subtle.exportKey('raw', efemera.publicKey));
  const uaChave = await crypto.subtle.importKey('raw', buf(uaPublica), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const compartilhado = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaChave }, efemera.privateKey, 256));

  const infoChave = juntar(enc.encode('WebPush: info\0'), uaPublica, asPublica);
  const ikm = await hkdf(segredo, compartilhado, infoChave, 32);
  const salt = opcoes.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const chaveAes = await crypto.subtle.importKey('raw', buf(cek), 'AES-GCM', false, ['encrypt']);
  const claro = juntar(mensagem, new Uint8Array([2])); // delimitador do último registro
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(nonce) }, chaveAes, buf(claro)));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, TAMANHO_REGISTRO);
  return juntar(salt, rs, new Uint8Array([asPublica.length]), asPublica, cifrado);
}

export interface RespostaPush {
  status: number;
}

/** Envia um push real. `buscar` é injetável para testes. */
export async function enviarPush(
  inscricao: InscricaoPush,
  conteudo: unknown,
  vapid: ChavesVapid,
  opcoes: { ttl?: number; urgencia?: 'high' | 'normal'; topico?: string; buscar?: typeof fetch } = {},
): Promise<RespostaPush> {
  const corpo = await cifrar(enc.encode(JSON.stringify(conteudo)), inscricao);
  const cab: Record<string, string> = {
    Authorization: await cabecalhoVapid(inscricao.endpoint, vapid),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(opcoes.ttl ?? 6 * 3600),
    Urgency: opcoes.urgencia ?? 'normal',
  };
  // Topic: no máximo 32 caracteres do alfabeto base64url; substitui um push anterior com o mesmo tópico.
  if (opcoes.topico) cab.Topic = opcoes.topico.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  const r = await (opcoes.buscar ?? fetch)(inscricao.endpoint, { method: 'POST', headers: cab, body: buf(corpo) });
  return { status: r.status };
}
