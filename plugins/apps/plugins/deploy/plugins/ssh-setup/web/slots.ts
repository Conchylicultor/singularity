import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { Server } from "@plugins/apps/plugins/deploy/plugins/servers/web";

/**
 * One provider-specific step of the install flow. Generating the key and
 * verifying the connection are generic and owned by the section itself — a
 * provider only ever describes how to get the public key onto its machines, so
 * a new provider cannot forget (or re-implement) the shared steps.
 */
export interface SshInstallStep {
  title: string;
  /**
   * The section mounts this body only once a key exists (a dimmed, bodyless
   * step still previews what is coming), so `publicKey` is non-null by
   * construction — no provider has to handle the "no key yet" case. Note this
   * is a MOUNT gate, not step inertness: an `inert` step still renders its
   * children, so the guarantee comes from the section not rendering the body.
   */
  Body: ComponentType<{ server: Server; publicKey: string }>;
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
   * The provider's install guidance, rendered between the generic generate and
   * verify steps. Numbering is owned by the shared `<Steps>` container, so a
   * provider never knows its own position in the flow.
   */
  installSteps: SshInstallStep[];
}

/** Registry slot (mirrors `Auth.Provider`): descriptor lookup, not a render list. */
export const SshProvider = defineSlot<SshProviderDescriptor>(
  "deploy.ssh-provider",
  { docLabel: (p) => p.name },
);
