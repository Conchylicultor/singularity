import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  StepLink,
  StepNote,
  StepCommand,
} from "@plugins/primitives/plugins/setup-steps/web";
import type { Server } from "@plugins/apps/plugins/deploy/plugins/servers/web";

/** authorized_keys install one-liner with the public key baked in. */
function installCommand(publicKey: string) {
  return `mkdir -p ~/.ssh && echo '${publicKey}' >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`;
}

/** Step body: get the user to a shell on the machine. */
export function OpenConsoleBody({ server }: { server: Server }) {
  return (
    <Stack gap="sm" align="start">
      <StepNote>
        In the server view, open the web terminal (the <b>&gt;_</b> button,
        top right) and log in as{" "}
        <Text as="code" variant="caption">{server.sshUser}</Text>.
      </StepNote>
      <StepLink href={server.consoleUrl ?? ""} label="Open console" />
    </Stack>
  );
}

/** Step body: the copyable one-liner appending the key to authorized_keys. */
export function InstallKeyBody({ publicKey }: { publicKey: string }) {
  return (
    <Stack gap="sm">
      <StepNote>
        Paste this into the web terminal (or any shell on the server):
      </StepNote>
      <StepCommand text={installCommand(publicKey)} title="Copy install command" />
    </Stack>
  );
}
