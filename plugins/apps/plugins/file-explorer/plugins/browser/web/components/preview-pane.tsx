import { useState, type ReactNode } from "react";
import { Bar } from "@plugins/primitives/plugins/bar/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { hostFsStat } from "@plugins/infra/plugins/host-fs/core";
import { FileTypeIcon } from "@plugins/primitives/plugins/file-type/web";
import {
  FileContent,
  FileTabs,
  useFileRenderers,
  useOpenHostFile,
} from "@plugins/primitives/plugins/file-viewer/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { baseName, formatModified, formatSize, parentPath } from "../../core";

const openIcon = symbol("open-in-new");
const closeIcon = symbol("close");

/**
 * The file open beside the listing: a header naming it (`parent · size ·
 * modified`) with Open with default app and Close, over the file viewer's best
 * renderer for it. The renderer tabs show only when there is a choice.
 */
export function PreviewPane({
  path,
  home,
  onClose,
  endSafeArea,
}: {
  /** The file, in display form (`~/…`). */
  path: string;
  home: string;
  onClose: () => void;
  /** The header sits at the surface's top-right corner (floating action bar). */
  endSafeArea: boolean;
}): ReactNode {
  const renderers = useFileRenderers({ file: { source: "host", path } });
  const openHostFile = useOpenHostFile();
  const name = baseName(path);
  return (
    <Column
      fill
      className="h-full"
      scrollBody={false}
      header={
        <Bar tier="pane" endSafeArea={endSafeArea}>
          <FileTypeIcon name={name} className="size-5" />
          <Fill>
            <Stack gap="none">
              <Text variant="label" className="font-semibold">
                {name}
              </Text>
              <PreviewMeta path={path} home={home} />
            </Stack>
          </Fill>
          {renderers.resolved.length > 1 && <FileTabs {...renderers} />}
          <IconButton
            icon={openIcon}
            label="Open with default app"
            variant="ghost"
            onClick={() => openHostFile(path)}
          />
          <IconButton
            icon={closeIcon}
            label="Close (Esc)"
            variant="ghost"
            onClick={onClose}
          />
        </Bar>
      }
      body={
        <Scroll axis="both" className="h-full">
          <FileContent
            file={{ source: "host", path }}
            active={renderers.active}
          />
        </Scroll>
      }
    />
  );
}

/** `parent · size · modified`, from the file's own stat. */
function PreviewMeta({
  path,
  home,
}: {
  path: string;
  home: string;
}): ReactNode {
  const stat = useEndpoint(hostFsStat, {}, { query: { path } });
  const [now] = useState(() => Date.now());
  const parent = parentPath(path, home) ?? "/";
  const parts = [parent];
  if (stat.data?.kind === "ok") {
    parts.push(
      formatSize(stat.data.entry.size),
      formatModified(stat.data.entry.mtimeMs, now),
    );
  } else if (stat.data?.kind === "missing") {
    parts.push("no longer exists");
  } else if (stat.data?.kind === "denied") {
    parts.push("permission denied");
  }
  return (
    <Text variant="caption" className="text-muted-foreground">
      {parts.join(" · ")}
    </Text>
  );
}
