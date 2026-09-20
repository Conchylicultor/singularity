import { MdCampaign } from "react-icons/md";
import { PickerPill } from "@plugins/primitives/plugins/text-editor/plugins/composer/plugins/picker-pill/web";
import {
  PrepromptGlyph,
  usePrepromptItems,
} from "@plugins/conversations/plugins/preprompts/web";

export type PrepromptPillProps = {
  /** The picked preprompt's id, or `null` for none. */
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
};

/**
 * The composer bar's preprompt picker: reads "Preprompt" while nothing is
 * picked and the preprompt's own title once one is, tinted so a set preprompt
 * is visible without opening the menu.
 *
 * A picked id the library no longer has (the preprompt was deleted) reads as
 * unset — the same collapse-to-None `PrepromptSelect` has always done, rather
 * than printing an id nobody can act on.
 */
export function PrepromptPill({
  value,
  onChange,
  disabled,
}: PrepromptPillProps) {
  const items = usePrepromptItems();
  const picked = items.find((item) => item.value === value) ?? null;

  return (
    <PickerPill
      icon={MdCampaign}
      placeholder="Preprompt"
      highlight={picked !== null}
      disabled={disabled}
      ariaLabel="Preprompt"
    >
      {picked ? <PickerPill.Value>{picked.label}</PickerPill.Value> : null}
      <PickerPill.Group title="Preprompt">
        <PickerPill.Item
          selected={picked === null}
          onSelect={() => onChange(null)}
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
            selected={item.value === picked?.value}
            onSelect={() => onChange(item.value)}
          >
            {item.label}
          </PickerPill.Item>
        ))}
      </PickerPill.Group>
    </PickerPill>
  );
}
