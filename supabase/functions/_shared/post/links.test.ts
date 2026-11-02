import { describe as d2, expect as e2, it as i2 } from 'vitest';
import { GeradorLinkIndisponivel as Ind, GeradorLinkShopee, geradorLinkPara } from './links.ts';

d2('gerador de link ligado à Shopee (P1)', () => {
  i2('sem chave usa o gerador de reserva; com chave usa o link curto da Shopee', () => {
    const reserva = new Ind();
    e2(geradorLinkPara({}, reserva)).toBe(reserva);
    e2(geradorLinkPara({ SHOPEE_AFFILIATE_APP_ID: 'a', SHOPEE_AFFILIATE_APP_SECRET: 'b', SHOPEE_MODO: 'simulado' }, reserva)).toBe(reserva);
    e2(geradorLinkPara({ SHOPEE_AFFILIATE_APP_ID: 'a', SHOPEE_AFFILIATE_APP_SECRET: 'b' }, reserva)).toBeInstanceOf(GeradorLinkShopee);
  });
});
