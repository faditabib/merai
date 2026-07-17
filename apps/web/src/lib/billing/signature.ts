import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe webhook signature verification (documented scheme, no SDK): the
 * `Stripe-Signature` header carries `t=<ts>,v1=<hmac>`; the signed payload
 * is `${t}.${rawBody}` HMAC-SHA256'd with the endpoint secret. Pure and
 * unit-tested (Build 9).
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  endpointSecret: string,
  toleranceSeconds = 300,
  nowSeconds = Date.now() / 1000,
): boolean {
  if (!signatureHeader) return false;
  const parts = new Map(
    signatureHeader.split(",").map((kv) => {
      const eq = kv.indexOf("=");
      return [kv.slice(0, eq).trim(), kv.slice(eq + 1)] as const;
    }),
  );
  const timestamp = Number(parts.get("t"));
  const signature = parts.get("v1");
  if (!Number.isFinite(timestamp) || !signature) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const expected = createHmac("sha256", endpointSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Build a valid header — the test helper mirrors Stripe's CLI behavior. */
export function signStripePayload(
  rawBody: string,
  endpointSecret: string,
  timestampSeconds = Math.floor(Date.now() / 1000),
): string {
  const hmac = createHmac("sha256", endpointSecret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest("hex");
  return `t=${timestampSeconds},v1=${hmac}`;
}
