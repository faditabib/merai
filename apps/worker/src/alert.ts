import { env } from "./env";
import { log } from "./logger";

/**
 * Fire-and-forget ops alert. Posts to ALERT_WEBHOOK_URL when configured —
 * the payload carries both `text` (Slack-compatible) and `content`
 * (Discord-compatible) so one generic webhook env var covers either.
 * Log-only when unset. Never throws: alerting must not break job processing.
 */
export async function sendAlert(message: string): Promise<void> {
  log.warn(`ALERT: ${message}`);
  if (!env.alertWebhookUrl) return;
  try {
    const res = await fetch(env.alertWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: message, content: message }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) log.error(`alert webhook responded ${res.status}`);
  } catch (err) {
    log.error(
      `alert webhook unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
