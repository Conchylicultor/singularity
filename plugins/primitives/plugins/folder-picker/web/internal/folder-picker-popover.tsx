import { Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState } from "react";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { InlinePopover } from "@plugins/primitives/plugins/overlay/plugins/popover/web";
import { FolderPicker, UNAVAILABLE_MESSAGE } from "./folder-picker";
import { useHostDir } from "./use-host-dir";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const cancelIcon = symbol("cancel");
const checkCircleIcon = symbol("check-circle");
const folderOpenIcon = symbol("folder-open");

type Verdict = { valid: true } | { valid: false; reason: string };

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
  // `local` is seeded from `value` and re-initialized naturally on external
  // value changes by the caller remounting this component with `key={value}`
  // (the directory-path field renderer) — so no mirror effect is needed.
  const [local, setLocal] = useState(value);
  const [open, setOpen] = useState(false);

  const commit = (next: string) => {
    if (next !== value) onChange(next);
  };

  const hasValue = value.trim().length > 0;
  // The field holds an ABSOLUTE path: host-fs would also accept `~/…`, but
  // whoever reads the value need not expand it, so it is not offered as valid.
  const absolute = value.startsWith("/");
  const { data: validity } = useHostDir(value, {
    enabled: hasValue && absolute,
  });
  const verdict: Verdict | undefined = !hasValue
    ? undefined
    : !absolute
      ? { valid: false, reason: "Use an absolute path (starting with /)." }
      : validity === undefined
        ? undefined
        : validity.kind === "ok"
          ? { valid: true }
          : { valid: false, reason: UNAVAILABLE_MESSAGE[validity.kind] };

  return (
    <Stack direction="row" gap="xs" align="center">
      <Fill className="relative">
        <Input
          value={local}
          placeholder={placeholder ?? "Absolute folder path"}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => commit(local)}
          className="pr-2xl"
        />
        {verdict ? (
          <Pin to="right" offset="sm" stretch decorative>
            <Center axis="vertical">
              {verdict.valid ? (
                <Icon
                  icon={checkCircleIcon}
                  className="size-4 text-success"
                  title="Folder exists"
                />
              ) : (
                <Icon
                  icon={cancelIcon}
                  className="size-4 text-destructive-text"
                  title={verdict.reason}
                />
              )}
            </Center>
          </Pin>
        ) : null}
      </Fill>

      <InlinePopover
        resetOnClose
        open={open}
        onOpenChange={setOpen}
        align="end"
        tooltip="Browse folders"
        width="xl"
        padding="none"
        trigger={<IconButton icon={folderOpenIcon} label="Browse folders" />}
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
    </Stack>
  );
}
