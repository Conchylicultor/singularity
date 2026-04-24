import { resourceDescriptor } from "@core/shared/resource";
import type { AuthStateValue } from "./internal/lib";

/**
 * Web-facing typed view of the auth state resource. The server defines the
 * runtime backing in `plugins/auth/server/internal/auth-resource.ts` with the
 * same key. Following the `agents` pattern: web reads via the descriptor (no
 * server-side import), server registers via `defineResource`.
 */
export const authStateResource = resourceDescriptor<AuthStateValue>(
  "auth-state",
);
