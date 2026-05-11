import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useAccountStatus,
  startConnectFlow,
  currentWorktreeName,
} from "@plugins/auth/web";
import {
  setConfigValue,
  useSecretFieldSet,
} from "@plugins/config/web";
import { MdCheck, MdContentCopy, MdOpenInNew } from "react-icons/md";

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
  const [copied, setCopied] = useState(false);

  const clientIdState = useSecretFieldSet("auth-google.clientId");
  const clientSecretState = useSecretFieldSet("auth-google.clientSecret");
  const credentialsSaved = clientIdState.set && clientSecretState.set;
  const status = useAccountStatus("google");
  const connected = status?.connected;

  function handleProjectInput(raw: string) {
    setProjectId(extractProjectId(raw));
  }

  async function handleSaveCredentials() {
    setSaving(true);
    try {
      if (clientId) await setConfigValue("auth-google.clientId", clientId);
      if (clientSecret)
        await setConfigValue("auth-google.clientSecret", clientSecret);
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

  async function handleCopyRedirectUri() {
    await navigator.clipboard.writeText(REDIRECT_URI);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const hasProject = projectId.length > 0;

  return (
    <div className="flex flex-col gap-6 p-4 max-w-lg">
      <div>
        <label className="text-sm font-medium">GCP Project ID</label>
        <Input
          className="mt-1"
          placeholder="my-project-123"
          value={projectId}
          onChange={(e) => handleProjectInput(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Paste any GCP console URL, or type your project ID
        </p>
      </div>

      <ol className="flex flex-col gap-4">
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
          <div className="flex flex-col gap-2">
            <StepLink
              href={`https://console.cloud.google.com/auth/clients/create?project=${projectId}`}
              disabled={!hasProject}
            />
            <p className="text-xs text-muted-foreground">
              Application type: <span className="font-medium">Desktop app</span>
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted px-2 py-1 text-xs break-all">
                {REDIRECT_URI}
              </code>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={handleCopyRedirectUri}
              >
                {copied ? (
                  <MdCheck className="h-4 w-4 text-emerald-600" />
                ) : (
                  <MdContentCopy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add this as the Authorized redirect URI
            </p>
          </div>
        </Step>

        <Step
          number={5}
          title="Enter credentials"
          active={hasProject}
          done={credentialsSaved}
        >
          <div className="flex flex-col gap-2">
            {credentialsSaved ? (
              <div className="flex items-center gap-1 text-xs text-emerald-700">
                <MdCheck className="h-4 w-4" />
                Credentials configured
              </div>
            ) : (
              <>
                <Input
                  type="password"
                  placeholder="Client ID"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  disabled={!hasProject}
                />
                <Input
                  type="password"
                  placeholder="Client Secret"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  disabled={!hasProject}
                />
                <Button
                  variant="default"
                  size="sm"
                  disabled={
                    !hasProject || (!clientId && !clientSecret) || saving
                  }
                  onClick={handleSaveCredentials}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </>
            )}
          </div>
        </Step>

        <Step
          number={6}
          title="Connect your account"
          active={credentialsSaved}
          done={!!connected}
        >
          <div className="flex flex-col gap-2">
            {connected ? (
              <div className="flex items-center gap-1 text-xs text-emerald-700">
                <MdCheck className="h-4 w-4" />
                Connected
                {status.identity?.email ? ` (${status.identity.email})` : ""}
              </div>
            ) : (
              <>
                <Button
                  variant="default"
                  size="sm"
                  disabled={!credentialsSaved || connecting}
                  onClick={handleConnect}
                >
                  {connecting ? "Connecting…" : "Connect with Google"}
                </Button>
                {connectError ? (
                  <p className="text-xs text-destructive">{connectError}</p>
                ) : null}
              </>
            )}
          </div>
        </Step>
      </ol>
    </div>
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
      className={`flex gap-3 ${active ? "opacity-100" : "opacity-40 pointer-events-none"}`}
    >
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
          done
            ? "bg-emerald-500/15 text-emerald-700"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {done ? <MdCheck className="h-3.5 w-3.5" /> : number}
      </div>
      <div className="flex flex-col gap-1.5 min-w-0">
        <span className="text-sm font-medium">{title}</span>
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
      size="sm"
      disabled={disabled}
      onClick={() => window.open(href, "_blank")}
      className="w-fit"
    >
      Open
      <MdOpenInNew className="ml-1 h-3.5 w-3.5" />
    </Button>
  );
}
