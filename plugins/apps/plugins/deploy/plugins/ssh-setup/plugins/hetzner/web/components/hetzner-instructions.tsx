import { useState } from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  Steps,
  Step,
  StepLink,
  StepDone,
  StepNote,
  StepCommand,
} from "@plugins/primitives/plugins/setup-steps/web";
import {
  generateSshKeypair,
  type Server,
} from "@plugins/apps/plugins/deploy/plugins/servers/web";

/** authorized_keys install one-liner with the public key baked in. */
function installCommand(publicKey: string) {
  return `mkdir -p ~/.ssh && echo '${publicKey}' >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`;
}

export function HetznerInstructions({
  server,
  publicKey,
}: {
  server: Server;
  publicKey: string | null;
}) {
  const [generating, setGenerating] = useState(false);
  const configured = server.sshKeyConfigured;

  async function generate(replace: boolean) {
    if (
      replace &&
      !confirm(
        "Replace the existing SSH key? The server will only be reachable again once the new public key is installed.",
      )
    )
      return;
    setGenerating(true);
    try {
      await fetchEndpoint(generateSshKeypair, { id: server.id }, { body: { replace } });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Steps>
      <Step title="Generate an SSH key" state={configured ? "done" : "active"}>
        {configured ? (
          <Stack gap="sm" align="start">
            {publicKey ? (
              <StepDone>Key generated — the private half is stored securely.</StepDone>
            ) : (
              <StepDone>
                A key is already configured (pasted manually). Regenerate to get
                a managed key with a copyable install command.
              </StepDone>
            )}
            <Button
              variant="outline"
              loading={generating}
              onClick={() => void generate(true)}
            >
              Regenerate
            </Button>
          </Stack>
        ) : (
          <Stack gap="sm" align="start">
            <StepNote>
              Creates an ed25519 keypair on this machine. The private key is
              stored in the secrets store and never shown.
            </StepNote>
            <Button
              variant="default"
              loading={generating}
              onClick={() => void generate(false)}
            >
              Generate key
            </Button>
          </Stack>
        )}
      </Step>

      <Step
        title="Open the Hetzner console"
        state={publicKey ? "active" : "upcoming"}
      >
        <Stack gap="sm" align="start">
          <StepNote>
            In the server view, open the web terminal (the <b>&gt;_</b> button,
            top right) and log in as{" "}
            <Text as="code" variant="caption">{server.sshUser}</Text>.
          </StepNote>
          <StepLink href={server.consoleUrl ?? ""} label="Open console" />
        </Stack>
      </Step>

      <Step
        title="Install the public key"
        state={publicKey ? "active" : "upcoming"}
      >
        <Stack gap="sm">
          <StepNote>
            Paste this into the web terminal (or any shell on the server):
          </StepNote>
          <StepCommand
            text={publicKey ? installCommand(publicKey) : "…"}
            title="Copy install command"
          />
          <StepNote>
            Done — once the key is installed, this app can reach the server
            over SSH.
          </StepNote>
        </Stack>
      </Step>
    </Steps>
  );
}
