import type {
  GetAccessTokenArgs,
  TokenResponse,
} from "@plugins/auth/core";

const GATEWAY_BASE = "http://localhost:9000";
const RETRY_DELAY_MS = 250;

export class AuthCentralOfflineError extends Error {
  constructor() {
    super("Auth central runtime is unreachable");
    this.name = "AuthCentralOfflineError";
  }
}

export async function getTokenFromCentral(
  args: GetAccessTokenArgs,
): Promise<TokenResponse> {
  const url = `${GATEWAY_BASE}/api/auth/token`;
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  };
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    try {
      res = await fetch(url, init);
    } catch {
      throw new AuthCentralOfflineError();
    }
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw new AuthCentralOfflineError();
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`auth token bridge: ${res.status} ${text}`);
  }
  return (await res.json()) as TokenResponse;
}
