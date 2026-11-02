import { describe, expect, it } from 'vitest';
import { b64urlParaBytes, bytesParaB64url, cabecalhoVapid, cifrar, enviarPush } from './webpush.ts';
import { despachar, enviadoresSimulados, type InscricaoSalva, type Notificacao, type StoreNotificacoes } from './despachar.ts';
import type { Membro } from '../core/notificacoes.ts';

const enc = new TextEncoder();
const dec = new TextDecoder();
const buf = (b: Uint8Array) => b.slice().buffer as ArrayBuffer;

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) {
  const k = await crypto.subtle.importKey('raw', buf(ikm), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(info) }, k, n * 8));
}

/** Lado do navegador (RFC 8291), só para conferir a cifra. */
async function decifrar(corpo: Uint8Array, uaPar: CryptoKeyPair, uaPublica: Uint8Array, auth: Uint8Array) {
  const salt = corpo.slice(0, 16);
  const idlen = corpo[20];
  const asPublica = corpo.slice(21, 21 + idlen);
  const cifrado = corpo.slice(21 + idlen);
  const asChave = await crypto.subtle.importKey('raw', buf(asPublica), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const comp = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asChave }, uaPar.privateKey, 256));
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublica, ...asPublica]);
  const ikm = await hkdf(auth, comp, info, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const k = await crypto.subtle.importKey('raw', buf(cek), 'AES-GCM', false, ['decrypt']);
  const claro = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(nonce) }, k, buf(cifrado)));
  expect(claro[claro.length - 1]).toBe(2);
  return dec.decode(claro.slice(0, -1));
}

async function inscricaoFicticia() {
  const par = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { par, pub, auth, insc: { endpoint: 'https://push.exemplo.invalid/inscricao/1', p256dh: bytesParaB64url(pub), auth: bytesParaB64url(auth) } };
}

async function vapidFicticio() {
  const par = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
  return { par, chaves: { publica: bytesParaB64url(pub), privada: jwk.d!, assunto: 'mailto:teste@exemplo.invalid' } };
}

describe('Web Push (RFC 8291 e 8292)', () => {
  it('base64url ida e volta', () => {
    const b = crypto.getRandomValues(new Uint8Array(65));
    expect(b64urlParaBytes(bytesParaB64url(b))).toEqual(b);
  });

  it('a cifra aes128gcm é decifrada pelo lado do navegador', async () => {
    const { par, pub, auth, insc } = await inscricaoFicticia();
    const corpo = await cifrar(enc.encode('{"titulo":"Produto de teste A"}'), insc);
    expect(new DataView(corpo.buffer, corpo.byteOffset).getUint32(16)).toBe(4096);
    expect(corpo[20]).toBe(65);
    expect(await decifrar(corpo, par, pub, auth)).toBe('{"titulo":"Produto de teste A"}');
  });

  it('o JWT do VAPID é válido para a origem do endpoint', async () => {
    const { par, chaves } = await vapidFicticio();
    const agora = new Date('2026-11-02T20:00:00Z');
    const cab = await cabecalhoVapid('https://push.exemplo.invalid/inscricao/1', chaves, agora);
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(cab)!;
    expect(m[2]).toBe(chaves.publica);
    const [h, c, s] = m[1].split('.');
    const corpo = JSON.parse(dec.decode(b64urlParaBytes(c)));
    expect(JSON.parse(dec.decode(b64urlParaBytes(h)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(corpo).toEqual({ aud: 'https://push.exemplo.invalid', exp: agora.getTime() / 1000 + 43200, sub: 'mailto:teste@exemplo.invalid' });
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, par.publicKey, buf(b64urlParaBytes(s)), buf(enc.encode(`${h}.${c}`)));
    expect(ok).toBe(true);
  });

  it('enviarPush manda os cabeçalhos certos', async () => {
    const { chaves } = await vapidFicticio();
    const { insc } = await inscricaoFicticia();
    let pedido: { url: string; init: RequestInit } | null = null;
    const buscar = (async (url: string, init: RequestInit) => {
      pedido = { url, init };
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;
    const r = await enviarPush(insc, { titulo: 'T' }, chaves, { urgencia: 'high', buscar });
    expect(r.status).toBe(201);
    const h = pedido!.init.headers as Record<string, string>;
    expect(pedido!.url).toBe(insc.endpoint);
    expect(h['Content-Encoding']).toBe('aes128gcm');
    expect(h.Urgency).toBe('high');
    expect(h.Authorization.startsWith('vapid t=')).toBe(true);
  });
});

class StoreMemoria implements StoreNotificacoes {
  concluidas = new Map<string, unknown>();
  adiadas = new Map<string, Date>();
  falhas: Array<{ id: string; desistir: boolean }> = [];
  removidas: string[] = [];
  constructor(
    public fila: Notificacao[],
    public listaMembros: Membro[],
    public lista: InscricaoSalva[],
    public blocos = ['12:00', '21:00'],
  ) {}
  async tomar() {
    const l = this.fila;
    this.fila = [];
    return l;
  }
  async membros() {
    return this.listaMembros;
  }
  async blocosRevisao() {
    return this.blocos;
  }
  async inscricoes(ids: string[]) {
    return this.lista.filter((i) => ids.includes(i.user_id));
  }
  async removerInscricao(id: string) {
    this.removidas.push(id);
  }
  async marcarUsoInscricao() {}
  async concluir(id: string, r: unknown) {
    this.concluidas.set(id, r);
  }
  async adiar(id: string, para: Date) {
    this.adiadas.set(id, para);
  }
  async falhar(id: string, _r: unknown, desistir: boolean) {
    this.falhas.push({ id, desistir });
  }
}

const OPERADORA: Membro = { user_id: 'u-op', papel: 'operadora' };
const DONO: Membro = { user_id: 'u-dono', papel: 'dono' };
const notif = (p: Partial<Notificacao>): Notificacao => ({
  id: 'n1',
  user_id: null,
  tipo: 'lembrete_wa',
  titulo: 'Hora de enviar o post das 20h',
  corpo: 'Produto de teste A',
  link: '/publicar',
  enviar_em: '2026-11-02T23:00:00Z',
  tentativas: 1,
  ...p,
});
const insc = (id: string, user_id: string): InscricaoSalva => ({ id, user_id, endpoint: `https://push.exemplo.invalid/${id}`, p256dh: 'x', auth: 'y' });
const NOITE = () => new Date('2026-11-02T20:05:00-03:00');

describe('despachante', () => {
  it('envia por push a todos os aparelhos de todos os membros quando user_id é nulo', async () => {
    const store = new StoreMemoria([notif({})], [OPERADORA, DONO], [insc('a', 'u-op'), insc('b', 'u-op'), insc('c', 'u-dono')]);
    const s = enviadoresSimulados();
    const r = await despachar({ store, push: s.push, telegram: s.telegram, telegramChatLana: 'chat-teste', agora: NOITE });
    expect(r.enviadas).toBe(1);
    expect(s.registro.filter((x) => x.canal === 'push')).toHaveLength(3);
    expect(s.registro.some((x) => x.canal === 'telegram')).toBe(false);
  });

  it('sem aparelho inscrito, a Lana recebe pelo bot do Telegram; o dono não', async () => {
    const store = new StoreMemoria([notif({})], [OPERADORA, DONO], []);
    const s = enviadoresSimulados();
    await despachar({ store, push: s.push, telegram: s.telegram, telegramChatLana: 'chat-teste', agora: NOITE });
    expect(s.registro).toEqual([{ canal: 'telegram', destino: 'chat-teste', conteudo: expect.stringContaining('Hora de enviar') }]);
    expect(store.concluidas.has('n1')).toBe(true);
  });

  it('inscrição expirada (410) é removida e cai na alternativa do Telegram', async () => {
    const store = new StoreMemoria([notif({ user_id: 'u-op' })], [OPERADORA], [insc('a', 'u-op')]);
    const s = enviadoresSimulados();
    const r = await despachar({ store, push: { enviar: async () => ({ status: 410 }) }, telegram: s.telegram, telegramChatLana: 'chat-teste', agora: NOITE });
    expect(store.removidas).toEqual(['a']);
    expect(r.enviadas).toBe(1);
    expect(s.registro[0].canal).toBe('telegram');
  });

  it('falha em todos os canais tenta de novo e desiste na terceira tentativa', async () => {
    const quebrado = { enviar: async () => ({ status: 500 }) };
    const tg = { enviar: async () => ({ ok: false, status: 502 }) };
    const store = new StoreMemoria([notif({ tentativas: 1 }), notif({ id: 'n2', tentativas: 3 })], [OPERADORA], [insc('a', 'u-op')]);
    const r = await despachar({ store, push: quebrado, telegram: tg, telegramChatLana: 'chat-teste', agora: NOITE });
    expect(r.falhas).toBe(2);
    expect(store.falhas).toEqual([
      { id: 'n1', desistir: false },
      { id: 'n2', desistir: true },
    ]);
  });

  it('sem canal nenhum, conclui sem tentar de novo (fica só na lista do painel)', async () => {
    const store = new StoreMemoria([notif({ user_id: 'u-dono' })], [OPERADORA, DONO], []);
    const s = enviadoresSimulados();
    const r = await despachar({ store, push: s.push, telegram: s.telegram, telegramChatLana: 'chat-teste', agora: NOITE });
    expect(r.sem_canal).toBe(1);
    expect(s.registro).toEqual([]);
  });

  it('Atendente não urgente fora do bloco é adiada; nível 4 sai na hora', async () => {
    const store = new StoreMemoria(
      [notif({ id: 'r', tipo: 'atendente_rascunho' }), notif({ id: 'u', tipo: 'atendente_urgente' })],
      [OPERADORA],
      [insc('a', 'u-op')],
    );
    const s = enviadoresSimulados();
    const tarde = () => new Date('2026-11-02T15:00:00-03:00');
    const r = await despachar({ store, push: s.push, telegram: s.telegram, telegramChatLana: null, agora: tarde });
    expect(r).toMatchObject({ adiadas: 1, enviadas: 1 });
    expect(store.adiadas.get('r')).toEqual(new Date('2026-11-02T21:00:00-03:00'));
    expect(store.concluidas.has('u')).toBe(true);
  });

  it('nenhum envio vai para o WhatsApp nem para o canal: só push e o chat da Lana', async () => {
    const store = new StoreMemoria([notif({})], [OPERADORA, DONO], [insc('a', 'u-dono')]);
    const s = enviadoresSimulados();
    await despachar({ store, push: s.push, telegram: s.telegram, telegramChatLana: 'chat-teste', agora: NOITE });
    for (const e of s.registro) {
      expect(['push', 'telegram']).toContain(e.canal);
      if (e.canal === 'telegram') expect(e.destino).toBe('chat-teste');
      expect(e.destino).not.toMatch(/whatsapp|wa\.me/i);
    }
  });
});
