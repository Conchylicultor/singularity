import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  StepCommand,
  StepNote,
} from "@plugins/primitives/plugins/setup-steps/web";
import type { SshKey } from "@plugins/apps/plugins/deploy/plugins/servers/web";
import { installCommand } from "../internal/install-command";

/**
 * Body of the "Install the public key" step.
 *
 * With no key there is no code block and no copy button — a placeholder command
 * is something the user can copy and paste, and pasting `…` into a root shell
 * is worse than having nothing to paste.
 */
export function InstallKeyStep({ sshKey }: { sshKey: SshKey | null }) {
  if (!sshKey) {
    return (
      <StepNote>
        Generate or paste a key above and a one-line install command appears
        here.
      </StepNote>
    );
  }

  return (
    <Stack gap="sm">
      <StepNote>
        Paste this into the console (or any shell on the server):
      </StepNote>
      <StepCommand text={installCommand(sshKey)} title="Copy install command" />
      <StepNote>
        To check it landed, run{" "}
        <Text as="code" variant="caption">
          ssh-keygen -lf ~/.ssh/authorized_keys
        </Text>{" "}
        on the server — it should list the fingerprint shown in this
        section&apos;s header.
      </StepNote>
    </Stack>
  );
}
