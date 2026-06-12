import { MdEdit, MdVerticalSplit } from "react-icons/md";
import { SegmentedControl } from "@plugins/primitives/plugins/toggle-chip/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Story } from "@plugins/apps/plugins/story/plugins/render/web";

/**
 * The view switcher: a `SegmentedControl` with a fixed leading **Author** mode
 * plus one segment **per `Story.Renderer` contribution**, and a split-preview
 * toggle.
 *
 * The renderer segments are generated dynamically from
 * `Story.Renderer.useContributions()` — the shell never names a specific
 * renderer (collection-consumer clean: "author" is a generic editor mode, not a
 * contributor id). With zero renderers the control shows only **Author**; as
 * Slides / Blog land their segments appear automatically with no change here.
 */
export function StoryViewSwitcher({
  view,
  onView,
  split,
  onToggleSplit,
}: {
  view: string;
  onView: (id: string) => void;
  split: boolean;
  onToggleSplit: () => void;
}) {
  const renderers = Story.Renderer.useContributions();
  const options = [
    { id: "author", label: "Author", icon: <MdEdit className="size-3.5" /> },
    ...renderers.map((r) => ({
      id: r.id,
      label: r.label,
      icon: r.icon ? <r.icon className="size-3.5" /> : undefined,
    })),
  ];

  return (
    <div className="flex items-center gap-sm">
      <SegmentedControl options={options} value={view} onChange={onView} />
      <IconButton
        icon={MdVerticalSplit}
        label="Split preview"
        tooltip="Split preview"
        aria-pressed={split}
        onClick={onToggleSplit}
      />
    </div>
  );
}
