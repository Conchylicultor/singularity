import { SectionCard } from "@plugins/primitives/plugins/section-card/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { CopyButton } from "@plugins/primitives/plugins/copy-to-clipboard/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  Steps,
  Step,
  StepLink,
  type StepState,
} from "@plugins/primitives/plugins/setup-steps/web";
import type { Server } from "@plugins/apps/plugins/deploy/plugins/servers/web";
import {
  useServerVerified,
  VerifyConnectionBody,
} from "@plugins/apps/plugins/deploy/plugins/health/web";
import { SshProvider } from "../slots";
import { GenerateKeyStep } from "./generate-key-step";
import { InstallKeyStep } from "./install-key-step";

/**
 * The SSH-setup section of a server page. It **always renders**: key setup is
 * the collection's job, and a matched provider is decoration (title, icon,
 * console prose) on top of it. It used to bail out when the console URL was
 * empty, unparsable, or matched no provider — which left exactly those servers
 * with no way to set a key at all.
 *
 * Two facts, two owners, both rendered exactly once: the **fingerprint** (what
 * key we hold) lives in the header `actions`, and the **verdict** (whether that
 * key works) lives in the last step, owned by `health`. The header is the one
 * region visible both collapsed and expanded, so it is the real status line; a
 * step that reprinted the fingerprint would recreate the two-places-disagree
 * bug at a new pair of locations.
 */
export function SshSetupSection({ server }: { server: Server }) {
  const providers = SshProvider.useContributions();
  const verified = useServerVerified(server);
  const raw = server.consoleUrl;
  const url = raw && URL.canParse(raw) ? new URL(raw) : null;
  const provider = url ? providers.find((p) => p.match(url)) : undefined;

  const key = server.sshKey;
  const Icon = provider?.icon;
  const ConsoleInstructions = provider?.ConsoleInstructions;

  // Every step after the key shares one state: inert until we hold a key,
  // actionable until the probe succeeds, done after. They gate on the same
  // fact because they need the same thing — a key we can name AND dial with,
  // which is exactly `sshKey !== null`. A stored key we could not parse is not
  // installable (no line to copy) and not testable unattended, so it stays
  // `upcoming` rather than offering steps that can only fail.
  const afterKeyState: StepState = !key
    ? "upcoming"
    : verified
      ? "done"
      : "active";

  return (
    <SectionCard
      title={
        provider ? `Set up SSH access — ${provider.name}` : "Set up SSH access"
      }
      icon={Icon ? <Icon /> : undefined}
      // Expanded while action is needed; collapsed to one row once the
      // connection is actually proven (uncontrolled, so it stays open during
      // the flow itself). Keyed on `verified`, not on holding a key —
      // minting one is the first step of the flow, not the end of it.
      defaultOpen={!verified}
      actions={
        key ? (
          <Inline gap="xs">
            <Badge mono title={key.fingerprint} className="max-w-[16rem]">
              {key.fingerprint}
            </Badge>
            <CopyButton text={key.fingerprint} title="Copy fingerprint" />
          </Inline>
        ) : (
          <Badge variant="warning">No key</Badge>
        )
      }
    >
      {/* The collection owns every <Step> shell — `Steps` injects number/isLast
          onto its direct children, so a provider returning a <Step> would leak
          that protocol across a plugin boundary and break numbering. A provider
          supplies a step BODY. `{url && <Step/>}` composes correctly:
          Children.toArray drops `false`, so with no console URL the steps are
          simply numbered 1, 2, 3. */}
      <Steps>
        <Step title="Create an SSH key" state={key ? "done" : "active"}>
          <GenerateKeyStep server={server} />
        </Step>

        {url && (
          <Step
            title={
              provider ? `Open the ${provider.name} console` : "Open the console"
            }
            state={afterKeyState}
          >
            <Stack gap="sm" align="start">
              {ConsoleInstructions && (
                <ConsoleInstructions sshUser={server.sshUser} />
              )}
              <StepLink href={url.href} label="Open console" />
            </Stack>
          </Step>
        )}

        <Step title="Install the public key" state={afterKeyState}>
          <InstallKeyStep sshKey={key} />
        </Step>

        <Step title="Verify the connection" state={afterKeyState}>
          <VerifyConnectionBody server={server} />
        </Step>
      </Steps>
    </SectionCard>
  );
}
