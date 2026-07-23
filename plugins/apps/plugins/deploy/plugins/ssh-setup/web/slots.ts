import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { Server } from "@plugins/apps/plugins/deploy/plugins/servers/web";

/**
 * A hosting provider the SSH setup section knows how to guide the user
 * through. Contributed by per-provider sub-plugins; the section itself only
 * ever consumes this generic contract (it never names a provider).
 */
export interface SshProviderDescriptor {
  id: string;
  /** Display name, shown in the section header ("Set up SSH access — <name>"). */
  name: string;
  icon?: ComponentType<{ className?: string }>;
  /** Detects this provider from the server's console URL (client-side only). */
  match: (consoleUrl: URL) => boolean;
  /**
   * The provider-specific step-by-step flow. `publicKey` is the server's
   * generated public key, or null when no key was generated yet (including
   * when a key was pasted manually — the paste flow stores no public half).
   */
  Instructions: ComponentType<{ server: Server; publicKey: string | null }>;
}

/** Registry slot (mirrors `Auth.Provider`): descriptor lookup, not a render list. */
export const SshProvider = defineSlot<SshProviderDescriptor>(
  "deploy.ssh-provider",
  { docLabel: (p) => p.name },
);
