import { useState, type ReactNode } from "react";
import { Bar } from "@plugins/primitives/plugins/bar/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  ControlSizeProvider,
  subThemeScope,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Theme } from "@plugins/primitives/plugins/css/plugins/theme-boundary/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { hostFsStat } from "@plugins/infra/plugins/host-fs/core";
import { FileTypeIcon } from "@plugins/primitives/plugins/file-type/web";
import {
  FileContent,
  FileTabs,
  useFileRenderers,
  useIsInArchive,
  useOpenHostFile,
} from "@plugins/primitives/plugins/file-viewer/web";
import type { FileViewerGit } from "@plugins/primitives/plugins/file-viewer/core";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { filesDocumentTheme } from "../internal/theme";
import { baseName, formatModified, formatSize, parentPath } from "../../core";

const openIcon = symbol("open-in-new");
const closeIcon = symbol("close");

/**
 * The file open beside the listing: a header naming it (`parent · size ·
 * modified`) with Open with default app and Close, over the file viewer's best
 * renderer for it. The renderer tabs show only when there is a choice — a
 * changed file in a git checkout (`git`, from a lens) also offers its diff.
 */
export function PreviewPane({
  path,
  home,
  git,
  onClose,
  endSafeArea,
}: {
  /** The file, in display form (`~/…`). */
  path: string;
  home: string;
  /** The file's git context, when a lens knows it. */
  git: FileViewerGit | undefined;
  onClose: () => void;
  /** The header sits at the surface's top-right corner (floating action bar). */
  endSafeArea: boolean;
}): ReactNode {
  const renderers = useFileRenderers({
    file: { source: "host", path },
    ...(git !== undefined ? { git } : {}),
  });
  const openHostFile = useOpenHostFile();
  const inArchive = useIsInArchive(path);
  const name = baseName(path);
  return (
    <Column
      fill
      className="h-full"
      scrollBody={false}
      // The Files layout hides its sidebar beside an open file on a narrow
      // window, keyed on this mark.
      data-files-preview=""
      header={
        <Bar
          tier="pane"
          endSafeArea={endSafeArea}
          // The mockup's header: 16px in from the pane's edge, 10px between
          // its parts (off the spacing ramp, one step past `sm`).
          // eslint-disable-next-line spacing/no-adhoc-spacing -- the mockup's 10px header gap, between the ramp's 8px and 12px
          className="gap-[10px] pl-lg"
        >
          <FileTypeIcon name={name} className="size-5" />
          <Fill>
            <Stack gap="none">
              <Text
                variant="label"
                className="truncate font-semibold text-foreground"
              >
                {name}
              </Text>
              <PreviewMeta path={path} home={home} />
            </Stack>
          </Fill>
          {renderers.resolved.length > 1 && <FileTabs {...renderers} />}
          {!inArchive && (
            <IconButton
              icon={openIcon}
              label="Open with default app"
              variant="ghost"
              onClick={() => openHostFile(path)}
            />
          )}
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
          <Theme
            name={subThemeScope(filesDocumentTheme)}
            surface="none"
            // The code renderer is its own scroll box, sized to this height.
            className="h-full"
          >
            <FileContent
              file={{ source: "host", path }}
              active={renderers.active}
            />
          </Theme>
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
  } else if (stat.data?.kind === "unreadable-archive") {
    parts.push(`unreadable archive (${stat.data.reason})`);
  }
  return (
    // The small caption rung (`2xs`), faint.
    <ControlSizeProvider size="xs">
      <Text variant="caption" tone="faint" className="truncate">
        {parts.join(" · ")}
      </Text>
    </ControlSizeProvider>
  );
}
