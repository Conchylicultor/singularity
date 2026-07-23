import { useState } from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { createServer } from "../../shared/endpoints";
import { FieldShell, fieldInputClass, fieldTextareaClass } from "./server-fields";

/**
 * Create state of the unified server page: blank fields + an explicit "Add
 * Server" button (a row can't autosave until it exists). Renders the same
 * field layout as the edit form, so adding and editing look identical.
 */
export function ServerCreateForm({ onCreated }: { onCreated: (id: string) => void }) {
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
      onCreated(server.id);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack as="form" onSubmit={handleSubmit} gap="lg" className="p-lg">
      <FieldShell label="Name">
        <input
          className={fieldInputClass}
          placeholder="e.g. equin-prod"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </FieldShell>
      <FieldShell label="Host" required>
        <input
          className={fieldInputClass}
          placeholder="e.g. 49.13.197.105"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          required
          autoFocus
        />
      </FieldShell>
      <div className="flex gap-md">
        <FieldShell label="SSH User" className="flex-1">
          <input
            className={fieldInputClass}
            value={sshUser}
            onChange={(e) => setSshUser(e.target.value)}
          />
        </FieldShell>
        <FieldShell label="Port" className="w-20">
          <input
            className={fieldInputClass}
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
          />
        </FieldShell>
      </div>
      <FieldShell
        label="Console URL"
        hint="Link to the provider's management console for this server."
      >
        <input
          className={fieldInputClass}
          type="url"
          placeholder="e.g. https://console.hetzner.com/projects/…/servers/…"
          value={consoleUrl}
          onChange={(e) => setConsoleUrl(e.target.value)}
        />
      </FieldShell>
      <FieldShell label="SSH Private Key" hint="Stored encrypted. Can be added later.">
        <textarea
          className={fieldTextareaClass}
          rows={5}
          placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
          value={sshPrivateKey}
          onChange={(e) => setSshPrivateKey(e.target.value)}
        />
      </FieldShell>
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
