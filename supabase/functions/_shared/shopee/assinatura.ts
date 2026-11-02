// Assinatura das requisições da Open API de afiliados da Shopee.
// [SUPOSIÇÃO S-P1-3] Formato público conhecido: Authorization: SHA256 Credential=<AppId>, Timestamp=<ts>, Signature=<hex>,
// com Signature = SHA256(AppId + Timestamp + Payload + Secret). Conferir na seção Open API do painel antes do modo real.
// Usa Web Crypto (Deno e Node 20+).

export async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function cabecalhoAutorizacao(appId: string, segredo: string, payload: string, timestamp: number): Promise<string> {
  const assinatura = await sha256Hex(`${appId}${timestamp}${payload}${segredo}`);
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${assinatura}`;
}
