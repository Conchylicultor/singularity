import { SectionCard } from "@plugins/primitives/plugins/section-card/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { Server } from "@plugins/apps/plugins/deploy/plugins/servers/web";
import { SshProvider } from "../slots";

/**
 * Generic SSH-setup section: matches the server's console URL against the
 * registered providers and renders the matched provider's step-by-step
 * instructions inside a collapsible card. Renders nothing when the URL is
 * empty, unparsable, or matches no provider. Never names a specific provider.
 */
export function SshSetupSection({ server }: { server: Server }) {
  const providers = SshProvider.useContributions();
  const raw = server.consoleUrl;
  const url = raw && URL.canParse(raw) ? new URL(raw) : null;
  if (!url) return null;
  const provider = providers.find((p) => p.match(url));
  if (!provider) return null;

  const Icon = provider.icon;
  return (
    <SectionCard
      title={`Set up SSH access — ${provider.name}`}
      icon={Icon ? <Icon /> : undefined}
      // Expanded while action is needed; collapsed to one row once a key is
      // configured (uncontrolled, so it stays open during the flow itself).
      defaultOpen={!server.sshKeyConfigured}
      actions={<KeyStatusChip configured={server.sshKeyConfigured} />}
    >
      <provider.Instructions server={server} publicKey={server.sshPublicKey} />
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
