import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useCallback, useEffect, useRef, useState } from "react";
import { pendingFocus } from "./pending-focus";
import { useTreeListContext } from "./use-tree-row";

export type RenameInputProps = {
  nodeId: string;
  value: string;
  onCommit: (next: string) => void | Promise<void>;
  className?: string;
  placeholder?: string;
};

export function RenameInput({
  nodeId,
  value,
  onCommit,
  className,
  placeholder,
}: RenameInputProps) {
  const ctx = useTreeListContext();
  const isSelected = ctx.selectedId === nodeId;
  const shouldAutoFocus = ctx.pendingFocusId === nodeId;

  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!dirtyRef.current) setText(value);
  }, [value]);

  useEffect(() => {
    if (shouldAutoFocus && inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
      inputRef.current.select();
      ctx.clearPendingFocus();
    }
  }, [shouldAutoFocus, ctx]);

  const commit = useCallback(
    (v: string) => {
      dirtyRef.current = false;
      const next = v.trim() || "Untitled";
      if (next === value) return;
      void onCommit(next);
    },
    [value, onCommit],
  );

  const onChange = (v: string) => {
    dirtyRef.current = true;
    setText(v);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => commit(v), 500);
  };

  const onBlur = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    commit(text);
  };

  return (
    <input
      ref={inputRef}
      value={text}
      onChange={(e) => onChange(e.target.value)}
      onMouseDown={() => {
        if (!isSelected) {
          pendingFocus.set(nodeId);
          ctx.onSelect(nodeId);
        }
      }}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          inputRef.current?.blur();
        }
      }}
      placeholder={placeholder}
      className={cn(
        // `min-w-0` lets this flex item shrink below its intrinsic input
        // width; without it the input holds a ~20ch floor and pushes the
        // row's trailing actions past the container's right edge (where
        // overflow clips them — invisible even on hover). It also makes the
        // `truncate` above actually take effect.
        "min-w-0 flex-1 truncate bg-transparent outline-none",
        className,
      )}
    />
  );
}
