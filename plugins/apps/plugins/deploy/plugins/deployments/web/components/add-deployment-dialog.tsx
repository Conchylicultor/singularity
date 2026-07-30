import { useState, type ReactElement, type ReactNode } from "react";
import {
  Button,
  DialogTitle,
  DialogDescription,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  getEndpointErrorMessage,
  useEndpointMutation,
} from "@plugins/infra/plugins/endpoints/web";
import { useManifestItems } from "@plugins/plugin-meta/plugins/composition/web";
import {
  createDeployment,
  DEFAULT_LOOPBACK_PORT,
  deriveInstall,
  type Deployment,
} from "../../core";

/** One labelled row of the form. Local, tiny, and not chrome worth a primitive. */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <Stack gap="2xs">
      <Text as="label" variant="label">
        {label}
      </Text>
      {children}
      {hint && (
        <Text as="p" variant="caption" tone="muted">
          {hint}
        </Text>
      )}
    </Stack>
  );
}

/**
 * Add a deployment to one server: pick a composition, name the hostnames, pick
 * the loopback port. Those three fields are the whole record — everything about
 * the install (run user, dir layout, systemd unit, Caddy site) is derived from
 * the composition name, which is why the derived preview below is read-only
 * prose rather than more inputs.
 *
 * The composition list comes from `useManifestItems()` — the same hook the
 * Studio compositions pane reads, never `config_v2` directly. Compositions
 * already deployed on this server are omitted: `(composition, server)` is unique,
 * so offering one would only be a way to earn a 409.
 */
export function AddDeploymentDialog({
  serverId,
  existing,
  close,
}: {
  serverId: string;
  existing: readonly Deployment[];
  close: () => void;
}): ReactElement {
  const items = useManifestItems();
  const taken = new Set(existing.map((d) => d.compositionId));
  const available = items.map((i) => i.name).filter((name) => !taken.has(name));

  const [composition, setComposition] = useState("");
  const [hostnames, setHostnames] = useState("");
  const [port, setPort] = useState(String(DEFAULT_LOOPBACK_PORT));

  // `suppressError` + an inline message: every rejection here names a field on
  // this very form (an unknown composition lists what is known, a malformed
  // hostname says what a hostname must look like, a duplicate or a taken port
  // names the invariant), so it belongs beside the inputs rather than in a toast
  // that outlives the dialog.
  const create = useEndpointMutation(createDeployment, {
    meta: { suppressError: true },
    onSuccess: () => close(),
  });

  const install = composition ? deriveInstall(composition) : null;

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    if (!composition) return;
    create.mutate({
      body: {
        compositionId: composition,
        serverId,
        hostnames: parseHostnames(hostnames),
        loopbackPort: Number(port),
      },
    });
  }

  return (
    <Stack as="form" onSubmit={submit} gap="md">
      <Stack gap="xs">
        <DialogTitle>Add a deployment</DialogTitle>
        <DialogDescription>
          Where a composition is served on this server, and under what URL.
        </DialogDescription>
      </Stack>

      <Field
        label="Composition"
        hint={
          available.length === 0
            ? "Every composition already has a deployment on this server."
            : undefined
        }
      >
        <Select value={composition} onValueChange={(v) => setComposition(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="Pick a composition" />
          </SelectTrigger>
          <SelectContent>
            {available.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="Hostnames"
        hint="Comma-separated, e.g. equin.ai, www.equin.ai. Leave empty to serve on loopback only — a deployment with no hostname gets no Caddy site and is not internet-reachable."
      >
        <Input
          value={hostnames}
          placeholder="equin.ai"
          onChange={(e) => setHostnames(e.target.value)}
        />
      </Field>

      <Field
        label="Loopback port"
        hint="The port the gateway binds on 127.0.0.1; Caddy proxies to it. Unique per server."
      >
        <Input
          type="number"
          value={port}
          onChange={(e) => setPort(e.target.value)}
        />
      </Field>

      {install && (
        <Stack gap="2xs">
          <Text as="p" variant="caption" tone="muted">
            Derived from the composition name — not editable, and not stored:
          </Text>
          <Text as="p" variant="caption" tone="muted">
            <Text as="code" variant="caption">
              {install.installDir}
            </Text>{" "}
            as{" "}
            <Text as="code" variant="caption">
              {install.runUser}
            </Text>
            , unit{" "}
            <Text as="code" variant="caption">
              {install.unit}
            </Text>
          </Text>
        </Stack>
      )}

      {create.isError && (
        <Text as="p" variant="caption" tone="destructive">
          {getEndpointErrorMessage(create.error)}
        </Text>
      )}

      <Stack direction="row" align="center" gap="sm">
        <Fill />
        <Button variant="ghost" type="button" onClick={close}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!composition || create.isPending}
          loading={create.isPending}
        >
          Add deployment
        </Button>
      </Stack>
    </Stack>
  );
}

/**
 * Split the hostnames field. Whitespace and commas both separate, because both
 * are what a person types — and the endpoint validates each resulting hostname
 * against a real DNS-label regex, so this only has to break the string up.
 */
function parseHostnames(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((h) => h.trim())
    .filter((h) => h !== "");
}
