export interface WebhookHttpClient {
  deliver(input: {
    url: string;
    event: string;
    payload: unknown;
    timeoutMs: number;
  }): Promise<{ ok: boolean; status: number; errorMessage?: string }>;
}
