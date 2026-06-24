import { Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useEffect, useState } from "react";
import { MdCancel, MdCheckCircle, MdFolderOpen } from "react-icons/md";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { FolderPicker } from "./folder-picker";
import { useHostDir } from "./use-host-dir";

export interface FolderPickerPopoverProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * A typeable/pasteable absolute-path input with a live validity indicator
 * (the path exists and is a directory) plus a "Browse" popover that walks the
 * host filesystem. Self-contained — no config_v2 dependency — so any surface
 * can pick a host folder.
 */
export function FolderPickerPopover({
  value,
  onChange,
  placeholder,
}: FolderPickerPopoverProps) {
  const [local, setLocal] = useState(value);
  const [open, setOpen] = useState(false);

  // Re-sync when the committed value changes underneath us (external edit).
  useEffect(() => setLocal(value), [value]);

  const commit = (next: string) => {
    if (next !== value) onChange(next);
  };

  const hasValue = value.trim().length > 0;
  const { data: validity } = useHostDir(value, { enabled: hasValue });
  const valid = validity?.exists === true && validity.isDirectory;

  return (
    <div className="flex items-center gap-xs">
      <div className="relative flex-1">
        <Input
          value={local}
          placeholder={placeholder ?? "Absolute folder path"}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => commit(local)}
          className="pr-2xl"
        />
        {hasValue && validity ? (
          <Pin to="right" offset="sm" stretch decorative>
            <Center axis="vertical">
              {valid ? (
                <MdCheckCircle
                  className="size-4 text-success"
                  title="Folder exists"
                />
              ) : (
                <MdCancel
                  className="size-4 text-destructive"
                  title="Not an existing folder"
                />
              )}
            </Center>
          </Pin>
        ) : null}
      </div>

      <InlinePopover
        open={open}
        onOpenChange={setOpen}
        align="end"
        tooltip="Browse folders"
        width="xl"
        padding="none"
        trigger={<IconButton icon={MdFolderOpen} label="Browse folders" />}
      >
        <FolderPicker
          value={value}
          onSelect={(path) => {
            setLocal(path);
            commit(path);
            setOpen(false);
          }}
        />
      </InlinePopover>
    </div>
  );
}
