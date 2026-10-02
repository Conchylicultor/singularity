import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";
import { FOLDER_COLOR, fileToneColor, fileTypeOf } from "../../core";

const folderIcon = symbol("folder");
const folderOpenIcon = symbol("folder-open");

export interface FileTypeIconProps {
  /** The file's name or path; only the last segment is read. */
  name: string;
  /** A directory draws the folder glyph, whatever its name. */
  isDir?: boolean;
  /** An expanded directory draws the open folder. Ignored for files. */
  open?: boolean;
  /** Sizes the 1em icon (`size-4`, …), like any `<Icon>`. */
  className?: string;
}

/**
 * What a file IS, as a glyph: a directory is the Material folder in the
 * theme's `--folder` colour; a file is its Seti glyph (`fileTypeOf`) tinted by
 * its tone's `--file-<tone>` token. The Seti sprite is fetched the first time
 * one of these mounts.
 */
export function FileTypeIcon({
  name,
  isDir = false,
  open = false,
  className,
}: FileTypeIconProps) {
  if (isDir) {
    return (
      <Icon
        icon={open ? folderOpenIcon : folderIcon}
        className={className}
        style={{ color: FOLDER_COLOR }}
      />
    );
  }
  const type = fileTypeOf(name);
  return (
    <Icon
      icon={type.icon}
      className={className}
      style={{ color: fileToneColor(type.tone) }}
    />
  );
}
