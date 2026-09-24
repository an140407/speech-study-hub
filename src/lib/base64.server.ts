/** Converte base64 pra bytes brutos. Buffer existe no Node; no runtime do
 *  Cloudflare Workers cai no atob (ambos os ambientes usados por este app). */
export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(base64, "base64"));
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}