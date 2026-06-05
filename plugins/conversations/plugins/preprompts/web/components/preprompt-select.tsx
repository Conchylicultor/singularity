import { useConfig } from "@plugins/config_v2/web";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { prepromptsConfig } from "../../shared/config";

const OFF = "none";

export interface PrepromptSelectProps {
  /** The selected preprompt id, or `null` for none. */
  value: string | null;
  onChange: (id: string | null) => void;
  /** Label for the None option. Defaults to "None". */
  offLabel?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Controlled preprompt picker shared by the task-draft card and the task
 * detail section. Lists every preprompt in the config plus a None option;
 * stays in lockstep with the config because it reads it reactively.
 *
 * A selected id that no longer exists in the config (the preprompt was
 * deleted) collapses to None — `items` only maps live ids, so base-ui has no
 * label for a stale id and falls back to the placeholder.
 */
export function PrepromptSelect({
  value,
  onChange,
  offLabel = "None",
  ariaLabel,
  disabled,
  className,
}: PrepromptSelectProps) {
  const { preprompts } = useConfig(prepromptsConfig);
  const known = value != null && preprompts.some((p) => p.id === value);
  const selected = known ? value : OFF;

  // base-ui resolves the collapsed trigger label from `items`, not from the
  // (unmounted) option list — map every preprompt id to its title.
  const items: Record<string, string> = {
    [OFF]: offLabel,
    ...Object.fromEntries(preprompts.map((p) => [p.id, p.title || "Untitled"])),
  };

  return (
    <Select
      items={items}
      value={selected}
      onValueChange={(v: string | null) => {
        if (!v) return;
        onChange(v === OFF ? null : v);
      }}
      disabled={disabled}
    >
      <SelectTrigger aria-label={ariaLabel} className={cn("h-7 w-40 text-xs", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={OFF}>{offLabel}</SelectItem>
        {preprompts.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.title || "Untitled"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
