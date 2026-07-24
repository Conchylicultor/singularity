import { useState } from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { StepDone, StepNote } from "@plugins/primitives/plugins/setup-steps/web";
import {
  generateSshKeypair,
  type Server,
} from "@plugins/apps/plugins/deploy/plugins/servers/web";

/**
 * Body of the generic first step: mint the keypair. Nothing about it is
 * provider-specific — every provider's flow starts here — so it lives with the
 * flow rather than being re-implemented per provider.
 */
export function GenerateKeyBody({ server }: { server: Server }) {
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

  if (!configured) {
    return (
      <Stack gap="sm" align="start">
        <StepNote>
          Creates an ed25519 keypair on this machine. The private key is stored
          in the secrets store and never shown.
        </StepNote>
        <Button
          variant="default"
          loading={generating}
          onClick={() => void generate(false)}
        >
          Generate key
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="sm" align="start">
      {server.sshPublicKey ? (
        <StepDone>Key generated — the private half is stored securely.</StepDone>
      ) : (
        <StepDone>
          A key is already configured (pasted manually). Regenerate to get a
          managed key with a copyable install command.
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
  );
}
