import { type ReactNode, useState } from "react";
import { MdAdd } from "react-icons/md";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { CreateOption } from "../../core";

/**
 * Host-internal toolbar render of `DataViewProps.creators`. NOT exported from
 * the web barrel — consumers declare `creators` and the host renders this.
 *
 * - `0` (or undefined) → nothing.
 * - `1` → a labelled `Button`.
 * - `N` → a `+` `IconButton` opening a dropdown menu of icon + label (+ muted
 *   description) items.
 *
 * Owns a single shared in-flight `busy` flag: each `run` awaits `onSelect` in a
 * `try/finally`, disabling the control while pending — a consistent busy
 * affordance for every consumer.
 */
export function CreatorsControl({
  creators,
}: {
  creators?: CreateOption[];
}): ReactNode {
  const [busy, setBusy] = useState(false);

  if (!creators || creators.length === 0) return null;

  const run = async (c: CreateOption): Promise<void> => {
    setBusy(true);
    try {
      await c.onSelect();
    } finally {
      setBusy(false);
    }
  };

  if (creators.length === 1) {
    const c = creators[0]!;
    return (
      <Button disabled={busy} onClick={() => run(c)}>
        {c.icon}
        {c.label}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<IconButton icon={MdAdd} label="Create" disabled={busy} />}
      />
      <DropdownMenuContent align="end">
        {creators.map((c) => (
          <DropdownMenuItem
            key={c.id}
            disabled={busy}
            onClick={() => void run(c)}
          >
            {c.icon}
            <Stack gap="none">
              <Text variant="label">{c.label}</Text>
              {c.description ? (
                <Text variant="caption" tone="muted">
                  {c.description}
                </Text>
              ) : null}
            </Stack>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
