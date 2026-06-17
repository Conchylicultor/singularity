import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Story } from "../slots";

/**
 * Single-select picker over the contributed Story.Renderer lenses. Self-contained:
 * reads the slot's {id,label,icon} metadata (component sealed) — never names a
 * specific renderer (collection-consumer clean). A renderer set is a segment
 * group, so it routes through the SegmentedControl primitive.
 */
export function RendererPicker({
  activeId,
  onSelect,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const renderers = Story.Renderer.useContributions();

  if (renderers.length === 0) {
    return (
      <Text variant="caption" tone="muted">
        No renderers
      </Text>
    );
  }
  return (
    <SegmentedControl
      options={renderers.map((r) => {
        const Icon = r.icon;
        return {
          id: r.id,
          label: r.label,
          icon: Icon ? <Icon className="size-3.5" /> : undefined,
        };
      })}
      // No active renderer → "" matches no option, so none reads as selected.
      value={activeId ?? ""}
      onChange={onSelect}
    />
  );
}
