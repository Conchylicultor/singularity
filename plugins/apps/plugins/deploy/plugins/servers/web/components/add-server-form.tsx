import { useState } from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { createServer } from "../../shared/endpoints";

export function AddServerForm({ onSuccess }: { onSuccess: (id: string) => void }) {
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [sshUser, setSshUser] = useState("root");
  const [consoleUrl, setConsoleUrl] = useState("");
  const [sshPrivateKey, setSshPrivateKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!host) return;
    setSubmitting(true);
    try {
      const server = await fetchEndpoint(createServer, {}, {
        body: {
          name: name || host,
          host,
          port: Number(port) || 22,
          sshUser: sshUser || "root",
          consoleUrl: consoleUrl || undefined,
          sshPrivateKey: sshPrivateKey || undefined,
        },
      });
      onSuccess(server.id);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack as="form" onSubmit={handleSubmit} gap="lg" className="p-lg">
      <Stack as="label" gap="xs">
        <Text as="span" variant="label">Name</Text>
        <input
          className="bg-input rounded-md border px-sm py-xs text-body"
          placeholder="e.g. equin-prod"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Stack>
      <Stack as="label" gap="xs">
        <Text as="span" variant="label">
          Host <span className="text-destructive">*</span>
        </Text>
        <input
          className="bg-input rounded-md border px-sm py-xs text-body"
          placeholder="e.g. 49.13.197.105"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          required
          autoFocus
        />
      </Stack>
      <div className="flex gap-md">
        <label className="flex flex-1 flex-col gap-xs">
          <Text as="span" variant="label">SSH User</Text>
          <input
            className="bg-input rounded-md border px-sm py-xs text-body"
            value={sshUser}
            onChange={(e) => setSshUser(e.target.value)}
          />
        </label>
        <label className="flex w-20 flex-col gap-xs">
          <Text as="span" variant="label">Port</Text>
          <input
            className="bg-input rounded-md border px-sm py-xs text-body"
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
          />
        </label>
      </div>
      <Stack as="label" gap="xs">
        <Text as="span" variant="label">Console URL</Text>
        <input
          className="bg-input rounded-md border px-sm py-xs text-body"
          type="url"
          placeholder="e.g. https://console.hetzner.com/projects/…/servers/…"
          value={consoleUrl}
          onChange={(e) => setConsoleUrl(e.target.value)}
        />
        <Text as="span" variant="caption" className="text-muted-foreground">
          Link to the provider's management console for this server.
        </Text>
      </Stack>
      <Stack as="label" gap="xs">
        <Text as="span" variant="label">SSH Private Key</Text>
        <textarea
          className="bg-input rounded-md border px-sm py-xs font-mono text-caption"
          rows={5}
          placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
          value={sshPrivateKey}
          onChange={(e) => setSshPrivateKey(e.target.value)}
        />
        <Text as="span" variant="caption" className="text-muted-foreground">
          Stored encrypted. Can be added later.
        </Text>
      </Stack>
      <Stack gap="none" direction="row" justify="end" className="pt-xs">
        <button
          type="submit"
          disabled={!host || submitting}
          className="bg-primary text-primary-foreground rounded-md px-md py-xs text-label disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add Server"}
        </button>
      </Stack>
    </Stack>
  );
}
