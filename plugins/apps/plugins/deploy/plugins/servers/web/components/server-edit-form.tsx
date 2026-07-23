import { useState } from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  useEditableField,
  type EditableField,
} from "@plugins/primitives/plugins/editable-field/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { Server } from "../../shared";
import {
  updateServer,
  deleteServer,
  type UpdateServerBody,
} from "../../shared/endpoints";
import { ServerStatusBadge } from "./server-status-badge";
import { FieldShell, fieldInputClass, fieldTextareaClass } from "./server-fields";

/** Wire an EditableField to a text input / textarea. */
function fieldProps(field: EditableField<string>) {
  return {
    value: field.value,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => field.onChange(e.target.value),
    onFocus: field.onFocus,
    onBlur: field.onBlur,
  };
}

/**
 * Edit state of the unified server page: the same field layout as the create
 * form, but every field autosaves through `updateServer` (the app's standard
 * debounced-autosave + sync-status cloud). Viewing a server is editing it.
 */
export function ServerEditForm({ server }: { server: Server }) {
  const save = async (body: UpdateServerBody): Promise<void> => {
    await fetchEndpoint(updateServer, { id: server.id }, { body });
  };

  const name = useEditableField({
    value: server.name,
    label: "Server name",
    onSave: (v) => save({ name: v || server.host }),
  });
  const host = useEditableField({
    value: server.host,
    label: "Host",
    // Host is required — an empty draft reverts to the stored value on blur
    // (the hook mirrors the unchanged server value back) rather than wiping it.
    onSave: (v) => (v ? save({ host: v }) : undefined),
  });
  const sshUser = useEditableField({
    value: server.sshUser,
    label: "SSH user",
    onSave: (v) => save({ sshUser: v || "root" }),
  });
  const port = useEditableField({
    value: String(server.port),
    label: "Port",
    onSave: (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? save({ port: n }) : undefined;
    },
  });
  const consoleUrl = useEditableField({
    value: server.consoleUrl ?? "",
    label: "Console URL",
    onSave: (v) => save({ consoleUrl: v || null }),
  });

  async function handleDelete() {
    if (!confirm(`Delete server "${server.name}"?`)) return;
    await fetchEndpoint(deleteServer, { id: server.id });
  }

  return (
    <Stack gap="lg" className="p-lg">
      <div className="flex items-center justify-between">
        <ServerStatusBadge status={server.status} />
        <Button
          variant="link"
          onClick={handleDelete}
          className="text-destructive hover:text-destructive"
        >
          Delete
        </Button>
      </div>
      <FieldShell label="Name">
        <input className={fieldInputClass} placeholder={server.host} {...fieldProps(name)} />
      </FieldShell>
      <FieldShell label="Host" required>
        <input className={fieldInputClass} {...fieldProps(host)} />
      </FieldShell>
      <div className="flex gap-md">
        <FieldShell label="SSH User" className="flex-1">
          <input className={fieldInputClass} {...fieldProps(sshUser)} />
        </FieldShell>
        <FieldShell label="Port" className="w-20">
          <input className={fieldInputClass} type="number" {...fieldProps(port)} />
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
          {...fieldProps(consoleUrl)}
        />
      </FieldShell>
      <SshKeyField server={server} />
    </Stack>
  );
}

/**
 * Write-only SSH key field. The stored key is a secret and never read back, so
 * this shows only the configured/not-set status and saves a pasted key on blur
 * (clearing the box on success). An empty box is a no-op — it never wipes the
 * stored key.
 */
function SshKeyField({ server }: { server: Server }) {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!key || saving) return;
    setSaving(true);
    try {
      await fetchEndpoint(updateServer, { id: server.id }, { body: { sshPrivateKey: key } });
      setKey("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FieldShell
      label="SSH Private Key"
      hint={
        <>
          <span className={server.sshKeyConfigured ? "text-success" : "text-warning"}>
            {server.sshKeyConfigured ? "Configured" : "Not set"}
          </span>
          {" — paste a key to " + (server.sshKeyConfigured ? "replace it." : "set it.")}
        </>
      }
    >
      <textarea
        className={fieldTextareaClass}
        rows={5}
        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onBlur={() => void save()}
      />
    </FieldShell>
  );
}
