import type { EditedFileStatus } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { FileContent } from "./file-content";
import { FilepathBreadcrumb } from "@plugins/primitives/plugins/filepath-breadcrumb/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { FileTabs } from "./file-tabs";
import { useFileRenderers } from "./use-file-renderers";

export function FilePaneView({
  worktree,
  path,
  status,
  line,
}: {
  worktree: string;
  path: string;
  status: EditedFileStatus;
  line?: number;
}) {
  const renderers = useFileRenderers({ path, status });
  return (
    <Column
      fill
      className="h-full"
      header={
        <Text as="div" variant="body" className="border-b px-sm py-xs">
          <Frame
            content={<FilepathBreadcrumb path={path} />}
            trailing={<FileTabs {...renderers} />}
          />
        </Text>
      }
      body={
        <Scroll axis="both" className="h-full">
          <FileContent worktree={worktree} path={path} line={line} active={renderers.active} />
        </Scroll>
      }
      scrollBody={false}
    />
  );
}
