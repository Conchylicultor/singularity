import {
  fetchEndpoint,
  useEndpointMutation,
  EndpointError,
} from "@plugins/infra/plugins/endpoints/web";
import {
  useEditableField,
  type EditableField,
} from "@plugins/primitives/plugins/editable-field/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { openDialog } from "@plugins/primitives/plugins/imperative-dialog/web";
import type { Server } from "../../shared";
import {
  updateServer,
  deleteServer,
  type UpdateServerBody,
} from "../../shared/endpoints";
import { FieldShell, fieldInputClass } from "./server-fields";
import { DeleteServerDialog } from "./delete-server-dialog";

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
 * The **identity section** of the server detail pane, contributed into
 * `ServerDetail` with `chrome: "none"` — a pane's identity block is not a titled
 * card, so it renders bare while still being a peer of the cards below it.
 *
 * Edit state of the unified server page: the same field layout as the create
 * form, but every field autosaves through `updateServer` (the app's standard
 * debounced-autosave + sync-status cloud). Viewing a server is editing it.
 *
 * No padding of its own: the section host supplies the pane's inset (`p-lg`) for
 * every section, card-chromed or bare.
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

  const remove = useEndpointMutation(deleteServer);

  function handleDelete() {
    // Fire-and-forget: don't return the openDialog promise, or the button would
    // auto-pend for the dialog's whole open lifetime. `loading={…isPending}`
    // reflects the actual delete instead.
    void openDialog((close) => (
      <DeleteServerDialog
        server={server}
        onCancel={close}
        onConfirm={() =>
          remove
            .mutateAsync({ params: { id: server.id } })
            .then(() => close())
            .catch((err: unknown) => {
              // Expected delete failure — the global toast already reported it;
              // keep the dialog open so the user can retry or cancel.
              if (err instanceof EndpointError) return;
              throw err;
            })
        }
      />
    ));
  }

  return (
    <Stack gap="lg">
      <Stack direction="row" align="center" justify="end" gap="sm">
        <Button
          variant="link"
          loading={remove.isPending}
          onClick={handleDelete}
          className="text-destructive hover:text-destructive"
        >
          Delete
        </Button>
      </Stack>
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
      {/* Deliberately NO ssh-key field here. Everything SSH-key-shaped lives in
          the `ssh-setup` section next door, which owns the whole flow: two write
          paths for one secret is how the status and the box came to contradict
          each other. */}
    </Stack>
  );
}
