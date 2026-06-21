import { Button, Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState } from "react";
import { CopyButton } from "@plugins/primitives/plugins/copy-to-clipboard/web";
import {
  useAccountStatus,
  startConnectFlow,
  currentWorktreeName,
} from "@plugins/auth/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { setConfigField } from "@plugins/config_v2/core";
import { useConfigRegistrations } from "@plugins/config_v2/web";
import { configV2SecretMetaResource } from "@plugins/fields/plugins/secret/plugins/config/core";
import { MdCheck, MdOpenInNew } from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";

const REDIRECT_URI = "http://localhost:9000/api/auth/callback/google";

function extractProjectId(raw: string): string {
  const match = raw.match(/[?&]project=([^&#]+)/);
  return match?.[1] ?? raw.trim();
}

export function GoogleSetupPane() {
  const [projectId, setProjectId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const registrations = useConfigRegistrations();
  const reg = registrations.find((r) => r.descriptor.name === "auth-google");
  const storePath = reg?.storePath ?? "";
  const metaResult = useResource(configV2SecretMetaResource, { path: storePath });
  const status = useAccountStatus("google");
  if (metaResult.pending) return <Loading />;
  const secretMeta = metaResult.data;
  const credentialsSaved = !!secretMeta.clientId?.set && !!secretMeta.clientSecret?.set;
  const connected = status?.connected;

  function handleProjectInput(raw: string) {
    setProjectId(extractProjectId(raw));
  }

  async function handleSaveCredentials() {
    if (!storePath) return;
    setSaving(true);
    try {
      if (clientId)
        await fetchEndpoint(setConfigField, {}, { body: { storePath, key: "clientId", value: clientId } });
      if (clientSecret)
        await fetchEndpoint(setConfigField, {}, { body: { storePath, key: "clientSecret", value: clientSecret } });
      setClientId("");
      setClientSecret("");
    } finally {
      setSaving(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    try {
      const result = await startConnectFlow({
        providerId: "google",
        worktree: currentWorktreeName(),
      });
      if (!result.ok && result.message && result.message !== "cancelled") {
        setConnectError(result.message);
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }

  const hasProject = projectId.length > 0;

  return (
    <Stack gap="xl" className="p-lg max-w-lg">
      <div>
        <Text as="label" variant="label">GCP Project ID</Text>
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- single-edge offset under label, no flex parent to own a gap */}
        <Input className="mt-1"
          placeholder="my-project-123"
          value={projectId}
          onChange={(e) => handleProjectInput(e.target.value)}
        />
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- single-edge offset under input, no flex parent to own a gap */}
        <Text as="p" variant="caption" className="mt-1 text-muted-foreground">
          Paste any GCP console URL, or type your project ID
        </Text>
      </div>

      <Stack as="ol" gap="lg">
        <Step
          number={1}
          title="Select or create a GCP project"
          active={true}
          done={hasProject}
        >
          <StepLink
            href="https://console.cloud.google.com/projectcreate"
            disabled={false}
          />
        </Step>

        <Step
          number={2}
          title="Enable Google Drive API"
          active={hasProject}
          done={false}
        >
          <StepLink
            href={`https://console.cloud.google.com/apis/library/drive.googleapis.com?project=${projectId}`}
            disabled={!hasProject}
          />
        </Step>

        <Step
          number={3}
          title="Set up OAuth consent screen"
          active={hasProject}
          done={false}
        >
          <StepLink
            href={`https://console.cloud.google.com/auth/overview?project=${projectId}`}
            disabled={!hasProject}
          />
        </Step>

        <Step
          number={4}
          title="Create OAuth 2.0 credentials"
          active={hasProject}
          done={false}
        >
          <Stack gap="sm">
            <StepLink
              href={`https://console.cloud.google.com/auth/clients/create?project=${projectId}`}
              disabled={!hasProject}
            />
            <Text as="p" variant="caption" className="text-muted-foreground">
              Application type: <span className="font-medium">Desktop app</span>
            </Text>
            <div className="flex items-center gap-sm">
              <Text as="code" variant="caption" className="flex-1 rounded-md bg-muted px-sm py-xs break-all">
                {REDIRECT_URI}
              </Text>
              <CopyButton
                text={REDIRECT_URI}
                title="Copy redirect URI"
                className="shrink-0"
              />
            </div>
            <Text as="p" variant="caption" className="text-muted-foreground">
              Add this as the Authorized redirect URI
            </Text>
          </Stack>
        </Step>

        <Step
          number={5}
          title="Enter credentials"
          active={true}
          done={credentialsSaved}
        >
          <Stack gap="sm">
            {credentialsSaved ? (
              <Text as="div" variant="caption" className="text-success">
                <Stack direction="row" align="center" gap="xs">
                  <MdCheck className="h-4 w-4" />
                  Credentials configured
                </Stack>
              </Text>
            ) : (
              <>
                <Input
                  type="password"
                  placeholder="Client ID"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                />
                <Input
                  type="password"
                  placeholder="Client Secret"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                />
                <Button
                  variant="default"
                  loading={saving}
                  disabled={!clientId && !clientSecret}
                  onClick={handleSaveCredentials}
                >
                  Save
                </Button>
              </>
            )}
          </Stack>
        </Step>

        <Step
          number={6}
          title="Connect your account"
          active={credentialsSaved}
          done={!!connected}
        >
          <Stack gap="sm">
            {connected ? (
              <Text as="div" variant="caption" className="text-success">
                <Stack direction="row" align="center" gap="xs">
                  <MdCheck className="h-4 w-4" />
                  Connected
                  {status.identity?.email ? ` (${status.identity.email})` : ""}
                </Stack>
              </Text>
            ) : (
              <>
                <Button
                  variant="default"
                  disabled={!credentialsSaved || connecting}
                  onClick={handleConnect}
                >
                  {connecting ? "Connecting…" : "Connect with Google"}
                </Button>
                {connectError ? (
                  <Text as="p" variant="caption" className="text-destructive">{connectError}</Text>
                ) : null}
              </>
            )}
          </Stack>
        </Step>
      </Stack>
    </Stack>
  );
}

function Step({
  number,
  title,
  active,
  done,
  children,
}: {
  number: number;
  title: string;
  active: boolean;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      className={`flex gap-md items-start ${active ? "opacity-100" : "opacity-40 pointer-events-none"}`}
    >
      <Center
        className={`size-6 shrink-0 rounded-full ${
          done
            ? "bg-success/15 text-success"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {done ? (
          <MdCheck className="h-3.5 w-3.5" />
        ) : (
          <Text as="span" variant="caption" className="font-medium">{number}</Text>
        )}
      </Center>
      <div className="flex flex-col gap-xs min-w-0">
        <Text as="span" variant="label">{title}</Text>
        {children}
      </div>
    </li>
  );
}

function StepLink({
  href,
  disabled,
}: {
  href: string;
  disabled: boolean;
}) {
  return (
    <Button
      variant="outline"
      disabled={disabled}
      onClick={() => window.open(href, "_blank")}
      className="w-fit"
    >
      Open
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- inline icon offset from button label */}
      <MdOpenInNew className="ml-1 h-3.5 w-3.5" />
    </Button>
  );
}
