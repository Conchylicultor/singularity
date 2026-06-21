import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { AuthAccountState } from "@plugins/auth/core";
import { Auth, type AuthScopeRequirement } from "../slots";
import { missingScopes } from "../scopes";
import { GrantAccessButton } from "./grant-access-button";

/**
 * Surfaces a "Grant access" affordance for every consumer-declared scope
 * requirement against this provider that is missing from the connected
 * account's granted scopes (and whose feature is enabled).
 */
export function ScopeGrantNotice({
  providerId,
  status,
}: {
  providerId: string;
  status: AuthAccountState;
}) {
  // Only OAuth accounts have grantable scopes.
  if (status.kind !== "oauth2") return null;

  const reqs = Auth.ScopeRequirement.useContributions().filter(
    (r) => r.providerId === providerId,
  );
  if (reqs.length === 0) return null;

  return (
    <Stack gap="sm">
      {reqs.map((r, i) => (
        <RequirementNotice key={i} requirement={r} status={status} />
      ))}
    </Stack>
  );
}

function RequirementNotice({
  requirement,
  status,
}: {
  requirement: AuthScopeRequirement;
  status: AuthAccountState;
}) {
  // `useEnabled` presence is stable per contribution instance, so branching on
  // it here keeps both sub-components rules-of-hooks clean.
  if (requirement.useEnabled) {
    return (
      <GatedNotice
        useEnabled={requirement.useEnabled}
        requirement={requirement}
        status={status}
      />
    );
  }
  return <ActiveNotice requirement={requirement} status={status} />;
}

function GatedNotice({
  useEnabled,
  requirement,
  status,
}: {
  useEnabled: () => boolean;
  requirement: AuthScopeRequirement;
  status: AuthAccountState;
}) {
  const enabled = useEnabled();
  if (!enabled) return null;
  return <ActiveNotice requirement={requirement} status={status} />;
}

function ActiveNotice({
  requirement,
  status,
}: {
  requirement: AuthScopeRequirement;
  status: AuthAccountState;
}) {
  // Only surface when something is actually missing. The button itself requests
  // the granted+requested union, so it never needs the missing diff.
  const missing = missingScopes(requirement.scopes, status.scopes);
  if (missing.length === 0) return null;

  const providerLabel =
    requirement.providerId.charAt(0).toUpperCase() +
    requirement.providerId.slice(1);

  return (
    <div className="flex items-center gap-sm">
      <div className="min-w-0 flex-1">
        <Stack gap="2xs">
          <Text as="div" variant="label" className="text-foreground">
            {requirement.reason}
          </Text>
          <Text as="div" variant="caption" className="text-muted-foreground">
            Needs additional {providerLabel} access
          </Text>
        </Stack>
      </div>
      <div className="flex shrink-0 items-center gap-sm">
        <GrantAccessButton
          providerId={requirement.providerId}
          scopes={requirement.scopes}
        />
      </div>
    </div>
  );
}
