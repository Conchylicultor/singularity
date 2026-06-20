import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { FileRenderersHandle } from "./use-file-renderers";

export function FileTabs({
  resolved,
  active,
  setActiveId,
}: FileRenderersHandle) {
  if (resolved.length === 0) return null;
  return (
    <Stack direction="row" gap="xs" align="center" role="tablist">
      {resolved.map(({ contribution: c }) => {
        const isActive = active?.contribution.id === c.id;
        return (
          <ToggleChip
            key={c.id}
            role="tab"
            aria-selected={isActive}
            active={isActive}
            variant="ghost"
            onClick={() => setActiveId(c.id)}
            className={isActive ? "bg-muted text-foreground hover:bg-muted" : undefined}
          >
            {c.label}
          </ToggleChip>
        );
      })}
    </Stack>
  );
}
