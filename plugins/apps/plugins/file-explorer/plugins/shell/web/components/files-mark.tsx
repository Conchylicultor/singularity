import { Icon } from "@plugins/ui/plugins/icons/web";
import { symbol } from "@plugins/ui/plugins/icons/core";

const folderIcon = symbol("folder");

/**
 * The Files mark: an outline folder in the app's slate blue, on no tile —
 * the glyph heading the app's own chrome (the launcher's face).
 */
export function FilesMark({ className }: { className?: string }) {
  return (
    <Icon
      icon={folderIcon}
      className={className}
      style={{ color: "#1f5a7c" }}
    />
  );
}
