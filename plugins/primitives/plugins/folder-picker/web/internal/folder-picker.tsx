import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState } from "react";
import { MdFolder } from "react-icons/md";
import { getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { FilepathBreadcrumb } from "@plugins/primitives/plugins/filepath-breadcrumb/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Spinner } from "@plugins/primitives/plugins/css/plugins/spinner/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { useHostDir } from "./use-host-dir";

export interface FolderPickerProps {
  /** Folder to open the browser at. Falls back to the user's home directory. */
  value?: string;
  /** Called with the absolute path when the user confirms a folder. */
  onSelect: (path: string) => void;
}

/**
 * Host-filesystem browser block: a breadcrumb of the current directory, a
 * scrollable list of its subdirectories to drill into, and a confirm action.
 * Presentational shell lives in {@link FolderPickerPopover}.
 */
export function FolderPicker({ value, onSelect }: FolderPickerProps) {
  const [browsePath, setBrowsePath] = useState<string | undefined>(
    value && value.trim().length > 0 ? value : undefined,
  );
  const { data, isLoading, isError, error } = useHostDir(browsePath);
  const subdirs = data?.entries.filter((e) => e.isDirectory) ?? [];

  return (
    <Stack gap="none">
      <div className="border-b p-sm">
        {data ? (
          <FilepathBreadcrumb
            path={data.path}
            showCopy={false}
            onNavigate={(dir) => setBrowsePath(dir)}
          />
        ) : (
          <Loading />
        )}
      </div>

      <Scroll className="max-h-64 min-h-24 p-xs">
        {isLoading ? (
          <Center axis="horizontal" className="p-md">
            <Spinner className="size-4 text-muted-foreground" />
          </Center>
        ) : isError ? (
          <Placeholder tone="error">{getEndpointErrorMessage(error)}</Placeholder>
        ) : data && !data.isDirectory ? (
          <Placeholder tone="error">Not a directory.</Placeholder>
        ) : subdirs.length === 0 ? (
          <Placeholder>No subfolders.</Placeholder>
        ) : (
          // eslint-disable-next-line data-view/no-adhoc-row-list -- directory drill-down picker (transient chrome)
          subdirs.map((entry) => (
            <Row
              key={entry.name}
              hover="muted"
              icon={<MdFolder className="text-muted-foreground" />}
              onClick={() => data && setBrowsePath(`${data.path}/${entry.name}`)}
            >
              <Text>{entry.name}</Text>
            </Row>
          ))
        )}
      </Scroll>

      <Stack direction="row" gap="none" justify="end" className="border-t p-sm">
        <Button
          disabled={!data || !data.isDirectory}
          onClick={() => data && onSelect(data.path)}
        >
          Select this folder
        </Button>
      </Stack>
    </Stack>
  );
}
