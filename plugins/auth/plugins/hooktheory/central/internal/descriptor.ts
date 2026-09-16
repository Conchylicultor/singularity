import { z } from "zod";
import {
  defineAuthProvider,
  type AuthIdentity,
  type AuthProviderDescriptor,
} from "@plugins/auth/core";
import { HOOKTHEORY_API_BASE, HOOKTHEORY_PROVIDER_ID } from "../../core";

const SIGN_IN_URL = `${HOOKTHEORY_API_BASE}/users/auth`;

/**
 * What a successful sign-in returns. `activkey` is a long-lived bearer token —
 * the only thing central keeps. The response also carries an `id`, which
 * nothing reads, so the schema leaves it out.
 */
const SignInResponseSchema = z.object({
  username: z.string().min(1),
  activkey: z.string().min(1),
});

const ErrorEnvelopeSchema = z.object({ message: z.string().min(1) });

/**
 * Hooktheory rejects a sign-in with a JSON envelope —
 * `{"name":"Unauthorized","message":"There are no accounts with this username.","code":0,"status":401}`.
 * Its `message` is the whole diagnosis, so it is surfaced verbatim. A body that
 * is not that envelope is passed through as-is rather than discarded.
 */
function hooktheoryErrorText(status: number, raw: string): string {
  try {
    const envelope = ErrorEnvelopeSchema.safeParse(JSON.parse(raw));
    if (envelope.success) return envelope.data.message;
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
  }
  return `Hooktheory refused the sign-in (HTTP ${status}). ${raw.slice(0, 500)}`;
}

async function exchangeHooktheoryPassword(creds: {
  username: string;
  password: string;
}): Promise<{ token: string; identity: AuthIdentity }> {
  const res = await fetch(SIGN_IN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(creds),
  }).catch((err: unknown) => {
    // Distinguish "this machine could not reach Hooktheory" from "Hooktheory
    // said no": both reach the sign-in dialog as a 400, and only one of them is
    // about the credentials.
    throw new Error(
      `Could not reach Hooktheory to sign in — check this machine's internet connection. (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(hooktheoryErrorText(res.status, raw));

  // A 2xx that is not the documented shape is Hooktheory changing its API, not
  // a wrong password — say so, naming what was missing.
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    throw new Error(
      `Hooktheory's sign-in answer was not JSON: ${raw.slice(0, 500)}`,
    );
  }
  const parsed = SignInResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(
      `Hooktheory's sign-in answer did not have the expected { username, activkey } shape: ${parsed.error.message}`,
    );
  }
  return {
    token: parsed.data.activkey,
    identity: { accountId: "primary", displayName: parsed.data.username },
  };
}

export const hooktheoryDescriptor: AuthProviderDescriptor = defineAuthProvider({
  id: HOOKTHEORY_PROVIDER_ID,
  name: "Hooktheory",
  kind: "password",
  password: { exchange: exchangeHooktheoryPassword },
});
