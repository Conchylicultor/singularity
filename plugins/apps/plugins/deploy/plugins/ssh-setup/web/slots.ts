import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";

export interface SshConsoleProps {
  /** The user the install command must be run as, per the server's row. */
  sshUser: string;
}

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
   * Provider-specific prose for reaching a root shell in THIS provider's
   * console — and nothing else.
   *
   * A provider contributes NO key handling: generate / paste / fingerprint /
   * install / verify / replace belong to the collection, so they exist
   * identically for every server, including ones whose console URL is empty,
   * unparsable, or matches no provider at all. The collection also owns every
   * `<Step>` shell (`Steps` injects `number`/`isLast` onto its direct
   * children), so a provider supplies a step *body*, never a step.
   */
  ConsoleInstructions: ComponentType<SshConsoleProps>;
}

/** Registry slot (mirrors `Auth.Provider`): descriptor lookup, not a render list. */
export const SshProvider = defineSlot<SshProviderDescriptor>(
  "deploy.ssh-provider",
  { docLabel: (p) => p.name },
);
