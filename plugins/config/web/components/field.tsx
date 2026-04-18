import { useEffect, useRef, useState } from "react";
import type { NormalizedField } from "@plugins/config/shared";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  field: NormalizedField;
  fullKey: string;
  value: unknown;
  onCommit: (value: unknown) => void;
}

/**
 * A single config field. Keeps local state while the input is focused (so a
 * push from the resource doesn't clobber the user's in-progress edit), and
 * commits on blur / debounced change.
 */
export function Field({ field, value, onCommit }: Props) {
  switch (field.kind) {
    case "boolean":
      return <BooleanField field={field} value={!!value} onCommit={onCommit} />;
    case "string":
      return <StringField field={field} value={String(value ?? "")} onCommit={onCommit} />;
    case "number":
      return <NumberField field={field} value={Number(value ?? 0)} onCommit={onCommit} />;
    case "string-list":
      return (
        <StringListField
          field={field}
          value={Array.isArray(value) ? (value as string[]) : []}
          onCommit={onCommit}
        />
      );
  }
}

function FieldHeader({ field }: { field: NormalizedField }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-sm font-medium">{field.label}</label>
      {field.description ? (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      ) : null}
    </div>
  );
}

function BooleanField({
  field,
  value,
  onCommit,
}: {
  field: NormalizedField;
  value: boolean;
  onCommit: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <FieldHeader field={field} />
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 cursor-pointer"
        checked={value}
        onChange={(e) => onCommit(e.target.checked)}
      />
    </div>
  );
}

function StringField({
  field,
  value,
  onCommit,
}: {
  field: NormalizedField;
  value: string;
  onCommit: (v: string) => void;
}) {
  const { local, setLocal, focus } = useLocalValue(value);
  return (
    <div className="flex flex-col gap-1.5 py-3">
      <FieldHeader field={field} />
      <Input
        value={local}
        onFocus={focus.onFocus}
        onBlur={() => {
          focus.onBlur();
          if (local !== value) onCommit(local);
        }}
        onChange={(e) => setLocal(e.target.value)}
      />
    </div>
  );
}

function NumberField({
  field,
  value,
  onCommit,
}: {
  field: NormalizedField;
  value: number;
  onCommit: (v: number) => void;
}) {
  const { local, setLocal, focus } = useLocalValue(String(value));
  return (
    <div className="flex flex-col gap-1.5 py-3">
      <FieldHeader field={field} />
      <Input
        type="number"
        value={local}
        onFocus={focus.onFocus}
        onBlur={() => {
          focus.onBlur();
          const n = Number(local);
          if (Number.isFinite(n) && n !== value) onCommit(n);
          else setLocal(String(value));
        }}
        onChange={(e) => setLocal(e.target.value)}
      />
    </div>
  );
}

function StringListField({
  field,
  value,
  onCommit,
}: {
  field: NormalizedField;
  value: string[];
  onCommit: (v: string[]) => void;
}) {
  const asText = value.join("\n");
  const { local, setLocal, focus } = useLocalValue(asText);
  return (
    <div className="flex flex-col gap-1.5 py-3">
      <FieldHeader field={field} />
      <textarea
        spellCheck={false}
        rows={Math.max(3, value.length + 1)}
        value={local}
        onFocus={focus.onFocus}
        onBlur={() => {
          focus.onBlur();
          const next = local.split("\n");
          // Server normalizes (trim/drop-empty/dedupe); compare pre-normalize.
          if (local !== asText) onCommit(next);
        }}
        onChange={(e) => setLocal(e.target.value)}
        className={cn(
          "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm font-mono transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
        )}
      />
    </div>
  );
}

/**
 * Local-editing buffer that ignores external value changes while focused.
 * This is the anti-echo protection: when the user is typing, server pushes
 * don't clobber the input.
 */
function useLocalValue(incoming: string) {
  const [local, setLocal] = useState(incoming);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(incoming);
  }, [incoming]);
  return {
    local,
    setLocal,
    focus: {
      onFocus: () => {
        focused.current = true;
      },
      onBlur: () => {
        focused.current = false;
      },
    },
  };
}
