import { SectionCard } from "@plugins/primitives/plugins/section-card/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  Steps,
  Step,
  type StepState,
} from "@plugins/primitives/plugins/setup-steps/web";
import type { Server } from "@plugins/apps/plugins/deploy/plugins/servers/web";
import {
  useServerVerified,
  VerifyConnectionBody,
} from "@plugins/apps/plugins/deploy/plugins/health/web";
import { SshProvider } from "../slots";
import { GenerateKeyBody } from "./generate-key-step";

/**
 * Generic SSH-setup section: matches the server's console URL against the
 * registered providers and renders the whole guided flow inside a collapsible
 * card. Renders nothing when the URL is empty, unparsable, or matches no
 * provider. Never names a specific provider.
 *
 * The flow — not the provider — owns the `<Steps>` container: generating a key
 * and verifying the connection are identical for every provider, so they exist
 * exactly once here and a provider contributes only its install guidance.
 * Every `<Step>` stays a DIRECT child of `<Steps>` (`Children.toArray` flattens
 * the `.map`), so the primitive's clone-based numbering keeps working unchanged.
 */
export function SshSetupSection({ server }: { server: Server }) {
  const providers = SshProvider.useContributions();
  const verified = useServerVerified(server);
  const raw = server.consoleUrl;
  const url = raw && URL.canParse(raw) ? new URL(raw) : null;
  if (!url) return null;
  const provider = providers.find((p) => p.match(url));
  if (!provider) return null;

  const publicKey = server.sshPublicKey;
  const configured = server.sshKeyConfigured;
  // Install steps need the public key's text, so they stay inert until one
  // exists. Verification only needs *a* key — a manually pasted one has no
  // public half but is perfectly testable — so it gates on `sshKeyConfigured`.
  const installState: StepState = !publicKey
    ? "upcoming"
    : verified
      ? "done"
      : "active";
  const verifyState: StepState = !configured
    ? "upcoming"
    : verified
      ? "done"
      : "active";

  const Icon = provider.icon;
  return (
    <SectionCard
      title={`Set up SSH access — ${provider.name}`}
      icon={Icon ? <Icon /> : undefined}
      // Expanded while action is needed; collapsed to one row once the
      // connection is actually proven (uncontrolled, so it stays open during
      // the flow itself). Keyed on `verified`, not on the key existing —
      // generating a key is the first step of the flow, not the end of it.
      defaultOpen={!verified}
      actions={<KeyStatusChip configured={configured} />}
    >
      <Steps>
        <Step title="Generate an SSH key" state={configured ? "done" : "active"}>
          <GenerateKeyBody server={server} />
        </Step>
        {provider.installSteps.map((step) => (
          <Step key={step.title} title={step.title} state={installState}>
            {/* Body only mounts once a key exists — `inert` dims and blocks
                interaction but still RENDERS, so an assertion here would let a
                provider interpolate a literal `null` (e.g. into an install
                one-liner). Gating the mount is what makes SshInstallStep's
                non-null `publicKey` true by construction; the dimmed, bodyless
                step still previews what is coming. */}
            {publicKey && <step.Body server={server} publicKey={publicKey} />}
          </Step>
        ))}
        <Step title="Verify the connection" state={verifyState}>
          <VerifyConnectionBody server={server} />
        </Step>
      </Steps>
    </SectionCard>
  );
}

function KeyStatusChip({ configured }: { configured: boolean }) {
  return (
    <Stack as="span" direction="row" align="center" gap="xs">
      <StatusDot
        colorClass={configured ? "bg-success" : "bg-warning"}
        className="inline-block"
      />
      <Text as="span" variant="caption" className="text-muted-foreground">
        {configured ? "Configured" : "Not set"}
      </Text>
    </Stack>
  );
}
