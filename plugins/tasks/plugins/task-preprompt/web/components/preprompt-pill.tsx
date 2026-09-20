import { PickerPill } from "@plugins/primitives/plugins/text-editor/plugins/composer/plugins/picker-pill/web";
import {
  PrepromptGlyph,
  usePrepromptItems,
} from "@plugins/conversations/plugins/preprompts/web";
import type { LaunchControlProps } from "@plugins/tasks/plugins/launch-options/web";

/**
 * The chosen preprompt's title as the pill's text. Never rendered for `None`.
 *
 * A stored id whose preprompt has since been deleted renders nothing, so the
 * pill falls back to its placeholder — the same collapse-to-None the select in
 * the task detail does.
 */
export function PrepromptPillValue({ value }: { value: string }) {
  const items = usePrepromptItems();
  const item = items.find((p) => p.value === value);
  return <>{item?.label}</>;
}

/**
 * The menu rows: `None`, then every preprompt in the library, each keeping its
 * own marker glyph.
 */
export function PrepromptPillMenu({
  value,
  onChange,
  disabled,
}: LaunchControlProps<string | null>) {
  const items = usePrepromptItems();
  return (
    <>
      <PickerPill.Item
        selected={value == null}
        onSelect={() => onChange(null)}
        disabled={disabled}
      >
        None
      </PickerPill.Item>
      {items.map((item) => (
        <PickerPill.Item
          key={item.value}
          icon={
            <PrepromptGlyph
              icon={item.icon}
              className="text-muted-foreground"
            />
          }
          selected={value === item.value}
          onSelect={() => onChange(item.value)}
          disabled={disabled}
        >
          {item.label}
        </PickerPill.Item>
      ))}
    </>
  );
}
