import { MdPerson, MdGroups } from "react-icons/md";
import {
  useEditMode,
  useReorderScope,
  setReorderScope,
  type ReorderScope,
} from "@plugins/reorder/web";
import {
  SegmentedControl,
  type SegmentedOption,
} from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";

const OPTIONS: readonly SegmentedOption<ReorderScope>[] = [
  {
    id: "personal",
    label: "Personal",
    icon: <MdPerson className="size-3.5" />,
    title: "Save this layout as your own per-worktree customization.",
  },
  {
    id: "everyone",
    label: "Everyone",
    icon: <MdGroups className="size-3.5" />,
    title:
      "Stage this layout as a committed default for review, then apply it for everyone.",
  },
];

/**
 * Edit-mode-only Personal / Everyone scope toggle. Renders next to the pen
 * button while edit mode is active; flips the module-level reorder scope so the
 * next in-app edit either writes the user layer ("Personal") or stages a
 * git-layer default ("Everyone").
 */
export function ScopeToggle() {
  const editMode = useEditMode();
  const scope = useReorderScope();
  if (!editMode) return null;
  return (
    <SegmentedControl
      options={OPTIONS}
      value={scope}
      onChange={setReorderScope}
      size="sm"
    />
  );
}
