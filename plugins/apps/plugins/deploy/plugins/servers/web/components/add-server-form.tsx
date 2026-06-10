import { useState } from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { createServer } from "../../shared/endpoints";

export function AddServerForm({ onSuccess }: { onSuccess: (id: string) => void }) {
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [sshUser, setSshUser] = useState("root");
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
          sshPrivateKey: sshPrivateKey || undefined,
        },
      });
      onSuccess(server.id);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      <label className="flex flex-col gap-1">
        <Text as="span" variant="label">Name</Text>
        <input
          className="bg-input rounded-md border px-2 py-1.5 text-body"
          placeholder="e.g. equin-prod"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <Text as="span" variant="label">
          Host <span className="text-destructive">*</span>
        </Text>
        <input
          className="bg-input rounded-md border px-2 py-1.5 text-body"
          placeholder="e.g. 49.13.197.105"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          required
          autoFocus
        />
      </label>
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <Text as="span" variant="label">SSH User</Text>
          <input
            className="bg-input rounded-md border px-2 py-1.5 text-body"
            value={sshUser}
            onChange={(e) => setSshUser(e.target.value)}
          />
        </label>
        <label className="flex w-20 flex-col gap-1">
          <Text as="span" variant="label">Port</Text>
          <input
            className="bg-input rounded-md border px-2 py-1.5 text-body"
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <Text as="span" variant="label">SSH Private Key</Text>
        <textarea
          className="bg-input rounded-md border px-2 py-1.5 font-mono text-caption"
          rows={5}
          placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
          value={sshPrivateKey}
          onChange={(e) => setSshPrivateKey(e.target.value)}
        />
        <Text as="span" variant="caption" className="text-muted-foreground">
          Stored encrypted. Can be added later.
        </Text>
      </label>
      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={!host || submitting}
          className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-label disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add Server"}
        </button>
      </div>
    </form>
  );
}
