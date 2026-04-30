import type { WebhookHttpClient } from '../../core/ports/WebhookHttpClient.js';

export class HttpClient implements WebhookHttpClient {
  async deliver(input: {
    url: string;
    event: string;
    payload: unknown;
    timeoutMs: number;
  }): Promise<{ ok: boolean; status: number; errorMessage?: string }> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const res = await fetch(input.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-webhook-event': input.event,
        },
        body: JSON.stringify(input.payload),
        signal: controller.signal,
      });
      if (res.ok) return { ok: true, status: res.status };
      const text = await res.text().catch(() => '');
      const snippet = text.slice(0, 500);
      return {
        ok: false,
        status: res.status,
        errorMessage: snippet ? `HTTP ${res.status}: ${snippet}` : `HTTP ${res.status}`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, status: 0, errorMessage: msg };
    } finally {
      clearTimeout(t);
    }
  }
}
