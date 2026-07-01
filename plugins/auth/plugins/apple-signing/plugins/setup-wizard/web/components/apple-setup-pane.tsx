import { Button, Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState } from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { configV2Resource, setConfigField } from "@plugins/config_v2/core";
import { useConfigRegistrations } from "@plugins/config_v2/web";
import { configV2SecretMetaResource } from "@plugins/fields/plugins/secret/plugins/config/core";
import { MdCheck, MdOpenInNew } from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { setAppleCertificateEndpoint } from "@plugins/auth/plugins/apple-signing/core";

async function fileToBase64(file: File): Promise<string> {
  return btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())));
}

export function AppleSetupPane() {
  const [password, setPassword] = useState("");
  const [p12Base64, setP12Base64] = useState("");
  const [p12FileName, setP12FileName] = useState("");
  const [savingCert, setSavingCert] = useState(false);
  const [certError, setCertError] = useState<string | null>(null);
  const [manualIdentity, setManualIdentity] = useState("");

  const [p8FileName, setP8FileName] = useState("");
  const [p8Pem, setP8Pem] = useState("");
  const [keyId, setKeyId] = useState("");
  const [issuerId, setIssuerId] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  const registrations = useConfigRegistrations();
  const reg = registrations.find((r) => r.descriptor.name === "apple-signing");
  const storePath = reg?.storePath ?? "";
  const metaResult = useResource(configV2SecretMetaResource, { path: storePath });
  const cfgResult = useResource(configV2Resource, { path: storePath });

  if (metaResult.pending || cfgResult.pending) return <Loading />;
  const secretMeta = metaResult.data;
  const cfg = (cfgResult.data ?? {}) as {
    signingIdentity?: string;
    ascKeyId?: string;
    ascIssuerId?: string;
  };

  const p12Set = !!secretMeta.p12Cert?.set;
  const ascKeySet = !!secretMeta.ascApiKey?.set;
  const identity = cfg.signingIdentity;
  const certDone = p12Set && !!identity;
  // Derivation failed (or not yet attempted after upload): cert stored but no
  // identity → reveal a manual identity field.
  const needsManualIdentity = p12Set && !identity;
  const apiKeyDone = ascKeySet && !!cfg.ascKeyId && !!cfg.ascIssuerId;
  const allDone = certDone && apiKeyDone;

  async function handleP12File(file: File | undefined) {
    if (!file) return;
    setCertError(null);
    setP12FileName(file.name);
    setP12Base64(await fileToBase64(file));
  }

  async function handleSaveCert() {
    if (!p12Base64) return;
    setSavingCert(true);
    setCertError(null);
    try {
      const res = await fetchEndpoint(
        setAppleCertificateEndpoint,
        {},
        { body: { p12Base64, password } },
      );
      if (res.signingIdentity === null) {
        setCertError(
          "Could not read the signing identity from the certificate. Enter it manually below.",
        );
      }
      setPassword("");
      setP12Base64("");
      setP12FileName("");
    } finally {
      setSavingCert(false);
    }
  }

  async function handleSaveManualIdentity() {
    if (!storePath || !manualIdentity) return;
    await fetchEndpoint(
      setConfigField,
      {},
      { body: { storePath, key: "signingIdentity", value: manualIdentity } },
    );
    setManualIdentity("");
  }

  async function handleP8File(file: File | undefined) {
    if (!file) return;
    setP8FileName(file.name);
    setP8Pem(await file.text());
  }

  async function handleSaveApiKey() {
    if (!storePath) return;
    setSavingKey(true);
    try {
      if (p8Pem)
        await fetchEndpoint(setConfigField, {}, { body: { storePath, key: "ascApiKey", value: p8Pem } });
      if (keyId)
        await fetchEndpoint(setConfigField, {}, { body: { storePath, key: "ascKeyId", value: keyId } });
      if (issuerId)
        await fetchEndpoint(setConfigField, {}, { body: { storePath, key: "ascIssuerId", value: issuerId } });
      setP8Pem("");
      setP8FileName("");
      setKeyId("");
      setIssuerId("");
    } finally {
      setSavingKey(false);
    }
  }

  return (
    <Stack gap="xl" className="p-lg max-w-lg">
      <Text as="p" variant="caption" className="text-muted-foreground">
        Configure Developer ID signing so the next Desktop (Tauri) release is
        signed and notarized. Credentials are stored encrypted on this machine.
      </Text>

      <Stack as="ol" gap="lg">
        <Step
          number={1}
          title="Enrolled in the Apple Developer Program"
          active={true}
          done={false}
        >
          <StepLink href="https://developer.apple.com/account" disabled={false} />
        </Step>

        <Step
          number={2}
          title="Create a Developer ID Application certificate"
          active={true}
          done={p12Set}
        >
          <Stack gap="sm">
            <StepLink
              href="https://developer.apple.com/account/resources/certificates/list"
              disabled={false}
            />
            <Text as="p" variant="caption" className="text-muted-foreground">
              Download it, then in Keychain Access → right-click the cert →
              Export as .p12 with a password.
            </Text>
          </Stack>
        </Step>

        <Step
          number={3}
          title="Upload certificate"
          active={true}
          done={certDone}
        >
          <Stack gap="sm">
            {certDone ? (
              <Text as="div" variant="caption" className="text-success">
                <Stack direction="row" align="center" gap="xs">
                  <MdCheck className="h-4 w-4" />
                  Signing identity: <span className="font-mono">{identity}</span>
                </Stack>
              </Text>
            ) : (
              <>
                {/* eslint-disable-next-line spacing/no-adhoc-spacing -- native file input spacing */}
                <input
                  type="file"
                  accept=".p12"
                  onChange={(e) => void handleP12File(e.target.files?.[0])}
                  className="text-caption"
                />
                {p12FileName ? (
                  <Text as="p" variant="caption" className="text-muted-foreground">
                    Selected: <span className="font-mono">{p12FileName}</span>
                  </Text>
                ) : null}
                <Input
                  type="password"
                  placeholder="Certificate password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button
                  variant="default"
                  loading={savingCert}
                  disabled={!p12Base64}
                  onClick={handleSaveCert}
                >
                  Save certificate
                </Button>
                {certError ? (
                  <Text as="p" variant="caption" className="text-warning">{certError}</Text>
                ) : null}
                {needsManualIdentity ? (
                  <>
                    <Input
                      placeholder="Signing identity (e.g. Developer ID Application: Name (TEAMID))"
                      value={manualIdentity}
                      onChange={(e) => setManualIdentity(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      disabled={!manualIdentity}
                      onClick={handleSaveManualIdentity}
                    >
                      Save identity
                    </Button>
                  </>
                ) : null}
                <Text as="p" variant="caption" className="text-muted-foreground">
                  Stored encrypted on this machine.
                </Text>
              </>
            )}
          </Stack>
        </Step>

        <Step
          number={4}
          title="Create an App Store Connect API key"
          active={certDone}
          done={false}
        >
          <Stack gap="sm">
            <StepLink
              href="https://appstoreconnect.apple.com/access/integrations/api"
              disabled={!certDone}
            />
            <Text as="p" variant="caption" className="text-muted-foreground">
              Users and Access → Integrations → Keys → generate a key (Developer
              access). Download the .p8 once; copy the Key ID and Issuer ID.
            </Text>
          </Stack>
        </Step>

        <Step
          number={5}
          title="Enter API key"
          active={certDone}
          done={apiKeyDone}
        >
          <Stack gap="sm">
            {apiKeyDone ? (
              <Text as="div" variant="caption" className="text-success">
                <Stack direction="row" align="center" gap="xs">
                  <MdCheck className="h-4 w-4" />
                  API key configured
                </Stack>
              </Text>
            ) : (
              <>
                {/* eslint-disable-next-line spacing/no-adhoc-spacing -- native file input spacing */}
                <input
                  type="file"
                  accept=".p8"
                  onChange={(e) => void handleP8File(e.target.files?.[0])}
                  className="text-caption"
                />
                {p8FileName ? (
                  <Text as="p" variant="caption" className="text-muted-foreground">
                    Selected: <span className="font-mono">{p8FileName}</span>
                  </Text>
                ) : null}
                <Input
                  placeholder="Key ID"
                  value={keyId}
                  onChange={(e) => setKeyId(e.target.value)}
                />
                <Input
                  placeholder="Issuer ID"
                  value={issuerId}
                  onChange={(e) => setIssuerId(e.target.value)}
                />
                <Button
                  variant="default"
                  loading={savingKey}
                  disabled={!p8Pem && !keyId && !issuerId}
                  onClick={handleSaveApiKey}
                >
                  Save API key
                </Button>
                <Text as="p" variant="caption" className="text-muted-foreground">
                  Stored encrypted on this machine.
                </Text>
              </>
            )}
          </Stack>
        </Step>

        <Step
          number={6}
          title="Ready to sign"
          active={allDone}
          done={allDone}
        >
          <Text as="p" variant="caption" className="text-muted-foreground">
            The next Desktop (Tauri) release will be signed &amp; notarized.
          </Text>
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
    <Stack
      as="li"
      direction="row"
      gap="md"
      align="start"
      className={active ? "opacity-100" : "opacity-40 pointer-events-none"}
    >
      <Center
        className={`size-6 rounded-full ${
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
      <Fill>
        <Stack gap="xs">
          <Text as="span" variant="label">{title}</Text>
          {children}
        </Stack>
      </Fill>
    </Stack>
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
