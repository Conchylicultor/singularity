import { centralResourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";
import type { AuthStateValue } from "./internal/lib";

/**
 * Web-facing typed view of the auth state resource. Marked `origin: "central"`
 * so the browser's NotificationsClient subscribes via `/ws/central-notifications`
 * — auth tokens live on the central runtime, shared across all worktrees.
 */
export const authStateResource = centralResourceDescriptor<AuthStateValue>(
  "auth-state",
);
