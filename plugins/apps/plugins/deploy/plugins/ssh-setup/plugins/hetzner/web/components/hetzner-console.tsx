import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { StepNote } from "@plugins/primitives/plugins/setup-steps/web";
import type { SshConsoleProps } from "@plugins/apps/plugins/deploy/plugins/ssh-setup/web";

/**
 * How to reach a root shell in the Hetzner Cloud console — prose only.
 *
 * Everything about the key itself (generate, paste, fingerprint, install
 * command, verify, replace) belongs to the ssh-setup collection, so it works
 * identically for a server with no provider at all. This contributes a step
 * BODY; the collection owns the `<Step>` shell and its numbering.
 */
export function HetznerConsoleInstructions({ sshUser }: SshConsoleProps) {
  return (
    <StepNote>
      In the server view, open the web terminal (the <b>&gt;_</b> button, top
      right) and log in as{" "}
      <Text as="code" variant="caption">
        {sshUser}
      </Text>
      .
    </StepNote>
  );
}
