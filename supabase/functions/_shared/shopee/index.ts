// Escolhe o cliente da Shopee. Sem chave ou com SHOPEE_MODO=simulado: modo simulado (padrão seguro).
// Sem Deno.*: as variáveis entram por parâmetro (quem chama lê com env()).
import { clienteReal } from './real.ts';
import { clienteSimulado } from './simulado.ts';
import type { ClienteShopee } from './tipos.ts';

export type { BuscaOfertas, ClienteShopee, OfertaShopee } from './tipos.ts';
export { clienteReal } from './real.ts';
export { clienteSimulado } from './simulado.ts';

export interface EnvShopee {
  SHOPEE_MODO?: string;
  SHOPEE_AFFILIATE_APP_ID?: string;
  SHOPEE_AFFILIATE_APP_SECRET?: string;
}

export function modoShopee(e: EnvShopee): 'real' | 'simulado' {
  if (e.SHOPEE_MODO === 'simulado') return 'simulado';
  return e.SHOPEE_AFFILIATE_APP_ID && e.SHOPEE_AFFILIATE_APP_SECRET ? 'real' : 'simulado';
}

export function clienteShopee(e: EnvShopee, extra: { fetch?: typeof fetch; agora?: () => Date } = {}): ClienteShopee {
  return modoShopee(e) === 'real'
    ? clienteReal({ appId: e.SHOPEE_AFFILIATE_APP_ID!, segredo: e.SHOPEE_AFFILIATE_APP_SECRET!, ...extra })
    : clienteSimulado(extra);
}
