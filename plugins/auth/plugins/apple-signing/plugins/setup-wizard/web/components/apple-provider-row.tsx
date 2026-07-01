import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { configV2Resource } from "@plugins/config_v2/core";
import { useConfigRegistrations } from "@plugins/config_v2/web";
import { Auth } from "@plugins/auth/web";
import type { AuthProviderRowProps } from "@plugins/auth/web";
import { configV2SecretMetaResource } from "@plugins/fields/plugins/secret/plugins/config/core";
import { Loading } from "@plugins/primitives/plugins/loading/web";

export function AppleProviderRow({ providerId }: AuthProviderRowProps) {
  const providers = Auth.Provider.useContributions();
  const provider = providers.find((p) => p.id === providerId);

  const registrations = useConfigRegistrations();
  const reg = registrations.find((r) => r.descriptor.name === "apple-signing");
  const storePath = reg?.storePath ?? "";
  const metaResult = useResource(configV2SecretMetaResource, { path: storePath });
  const cfgResult = useResource(configV2Resource, { path: storePath });

  if (!provider) return null;
  const Icon = provider.icon;
  const configure = () => provider.configureCredentials?.();

  return (
    <Stack direction="row" gap="lg" align="start" className="p-lg">
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- top offset to baseline-align icon with adjacent text */}
      <Icon className="mt-1 size-6" />
      <Fill>
        {metaResult.pending || cfgResult.pending ? (
          <Loading variant="text" />
        ) : (
          <Body
            secretMeta={metaResult.data}
            cfg={
              (cfgResult.data ?? {}) as {
                signingIdentity?: string;
                ascKeyId?: string;
                ascIssuerId?: string;
              }
            }
            name={provider.name}
            onConfigure={configure}
          />
        )}
      </Fill>
    </Stack>
  );
}

function Body({
  secretMeta,
  cfg,
  name,
  onConfigure,
}: {
  secretMeta: Record<string, { set?: boolean } | undefined>;
  cfg: { signingIdentity?: string; ascKeyId?: string; ascIssuerId?: string };
  name: string;
  onConfigure: () => void;
}) {
  const p12Set = !!secretMeta.p12Cert?.set;
  const ascKeySet = !!secretMeta.ascApiKey?.set;
  const textComplete = !!cfg.signingIdentity && !!cfg.ascKeyId && !!cfg.ascIssuerId;
  const allSet = p12Set && ascKeySet && textComplete;
  const anySet =
    p12Set ||
    ascKeySet ||
    !!cfg.signingIdentity ||
    !!cfg.ascKeyId ||
    !!cfg.ascIssuerId;

  const pill = allSet ? (
    <Badge variant="success">Signing configured</Badge>
  ) : anySet ? (
    <Badge variant="warning">Incomplete</Badge>
  ) : (
    <Badge variant="muted">Not configured</Badge>
  );

  const label = allSet ? "Manage" : anySet ? "Finish setup" : "Configure";

  return (
    <Stack direction="row" gap="lg" align="start">
      <Fill>
        <Stack gap="xs">
          <Stack direction="row" align="center" gap="sm">
            <span className="font-medium">{name}</span>
            {pill}
          </Stack>
          {allSet && cfg.signingIdentity ? (
            <Text as="div" variant="body" className="text-muted-foreground truncate">
              {cfg.signingIdentity}
            </Text>
          ) : (
            <Text as="div" variant="caption" className="text-muted-foreground">
              Sign &amp; notarize desktop releases with a Developer ID.
            </Text>
          )}
        </Stack>
      </Fill>
      <Button variant={allSet ? "outline" : "default"} onClick={onConfigure}>
        {label}
      </Button>
    </Stack>
  );
}
