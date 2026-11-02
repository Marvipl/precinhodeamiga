// Publicação automática no Supabase: o que é enviado e o que é gerado.
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  gerarVapid,
  normalizarUrlSite,
  planejarAcessos,
  planejarSegredos,
  sqlAcessos,
  sqlVault,
} from '../scripts/publicar/plano.ts';

const gerarFixo = { token: () => 'token-de-teste', vapid: () => ({ publica: 'pub-teste', privada: 'priv-teste' }) };

describe('planejarSegredos', () => {
  it('copia só o que veio preenchido e gera o que falta no primeiro uso', () => {
    const { segredos, vapidPublicaNova } = planejarSegredos(
      { TELEGRAM_BOT_TOKEN: ' bot-teste ', SHOPEE_AFFILIATE_APP_ID: '', AGENTES_MODO: 'simulado', OUTRA: 'x' },
      new Set(),
      gerarFixo,
    );
    const nomes = segredos.map((s) => s.name);
    expect(nomes).toEqual(['TELEGRAM_BOT_TOKEN', 'AGENTES_MODO', 'AGENT_CALLBACK_TOKEN', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']);
    expect(segredos[0].value).toBe('bot-teste');
    expect(vapidPublicaNova).toBe('pub-teste');
  });

  it('não regenera token nem VAPID que já existem (não quebra inscrições de notificação)', () => {
    const { segredos, vapidPublicaNova } = planejarSegredos(
      {},
      new Set(['AGENT_CALLBACK_TOKEN', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']),
      gerarFixo,
    );
    expect(segredos).toEqual([]);
    expect(vapidPublicaNova).toBeUndefined();
  });

  it('PUBLIC_SITE_URL alimenta também SITE_URL, sem barra final', () => {
    const { segredos } = planejarSegredos(
      { PUBLIC_SITE_URL: 'https://exemplo-teste.netlify.app/' },
      new Set(['AGENT_CALLBACK_TOKEN', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']),
      gerarFixo,
    );
    expect(segredos).toEqual([
      { name: 'PUBLIC_SITE_URL', value: 'https://exemplo-teste.netlify.app' },
      { name: 'SITE_URL', value: 'https://exemplo-teste.netlify.app' },
    ]);
  });

  it('recusa site sem https', () => {
    expect(normalizarUrlSite('http://exemplo-teste.com')).toBeUndefined();
    expect(normalizarUrlSite('')).toBeUndefined();
  });
});

describe('gerarVapid', () => {
  it('gera par P-256 no formato do web-push e a privada assina o que a pública confere', () => {
    const { publica, privada } = gerarVapid();
    const pub = Buffer.from(publica, 'base64url');
    const priv = Buffer.from(privada, 'base64url');
    expect(pub.length).toBe(65);
    expect(pub[0]).toBe(4);
    expect(priv.length).toBe(32);
    const jwkPriv = {
      kty: 'EC',
      crv: 'P-256',
      x: pub.subarray(1, 33).toString('base64url'),
      y: pub.subarray(33).toString('base64url'),
      d: privada,
    };
    const chavePriv = crypto.createPrivateKey({ key: jwkPriv, format: 'jwk' });
    const chavePub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwkPriv.x, y: jwkPriv.y }, format: 'jwk' });
    const assinatura = crypto.sign('sha256', Buffer.from('teste'), chavePriv);
    expect(crypto.verify('sha256', Buffer.from('teste'), chavePub, assinatura)).toBe(true);
  });
});

describe('acessos e vault', () => {
  it('normaliza e-mails, recusa inválidos e gera SQL idempotente com aspas escapadas', () => {
    const { acessos, erros } = planejarAcessos({ emailLana: ' Lana.Teste@Exemplo.com ', emailMarcus: 'sem-arroba' });
    expect(acessos).toEqual([{ email: 'lana.teste@exemplo.com', papel: 'operadora', nome: 'Lana' }]);
    expect(erros).toEqual(['E-mail inválido para Marcus.']);
    const sql = sqlAcessos(acessos);
    expect(sql).toContain("('lana.teste@exemplo.com', 'operadora', 'Lana')");
    expect(sql).toContain('on conflict (email) do update');
  });

  it('vault cria ou atualiza os dois segredos', () => {
    const sql = sqlVault('https://ref-teste.supabase.co', "chave'teste");
    expect(sql).toContain("vault.create_secret('https://ref-teste.supabase.co', 'project_url')");
    expect(sql).toContain("vault.update_secret(i, 'chave''teste')");
    expect(sql).toContain("'service_role_key'");
  });
});
