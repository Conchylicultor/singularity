import { MdExpandMore } from "react-icons/md";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { selfClass } from "@plugins/primitives/plugins/css/plugins/spacing/web";

/**
 * "Fill from…" — replace a whole token group (or the colour adjustment) with a
 * named shortcut's values in one pick. A shortcut is an editor convenience, not
 * a setting: nothing remembers which one was used, and the values land in the
 * scope's theme like any other edit.
 */
export function FillFromMenu<T extends { id: string; label: string }>({
  shortcuts,
  onFill,
}: {
  shortcuts: readonly T[];
  onFill: (shortcut: T) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" className={selfClass("start")} />}
      >
        Fill from…
        <MdExpandMore />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {shortcuts.map((shortcut) => (
          <DropdownMenuItem key={shortcut.id} onClick={() => onFill(shortcut)}>
            {shortcut.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
