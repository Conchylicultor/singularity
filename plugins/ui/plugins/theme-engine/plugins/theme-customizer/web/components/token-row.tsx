import { useRef, useState } from "react";
import { MdUndo } from "react-icons/md";
import {
  Color,
  ColorPickerPopover,
} from "@plugins/primitives/plugins/css/plugins/color-picker/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

export interface TokenRowProps {
  label: string;
  cssVar: string;
  value: string;
  isOverridden: boolean;
  isSplit?: boolean;
  onValueChange: (newValue: string) => void;
  onReset: () => void;
  search: string;
}

export function TokenRow({
  label,
  cssVar,
  value,
  isOverridden,
  isSplit,
  onValueChange,
  onReset,
  search,
}: TokenRowProps): React.ReactElement | null {
  const [textValue, setTextValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search filtering
  if (search) {
    const q = search.toLowerCase();
    if (
      !label.toLowerCase().includes(q) &&
      !cssVar.toLowerCase().includes(q)
    ) {
      return null;
    }
  }

  const color = Color.fromCss(value);
  const isColor = color !== null;

  const handleColorChange = (newOklch: string) => {
    onValueChange(newOklch);
  };

  const handleTextBlur = () => {
    if (textValue !== value) {
      onValueChange(textValue);
    }
  };

  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      inputRef.current?.blur();
    }
  };

  // Keep local text state in sync with external value changes
  if (!isColor && textValue !== value) {
    setTextValue(value);
  }

  return (
    <Row hover="muted" className="gap-sm">
      {isColor ? (
        <ColorPickerPopover
          value={value}
          onChange={handleColorChange}
        />
      ) : null}

      {/* eslint-disable-next-line layout/no-adhoc-layout -- flexible truncating leaf of Row's flex (label + cssVar column) */}
      <Stack gap="none" className="flex-1 min-w-0">
        <Text as="span" variant="label" className="truncate">{label}</Text>
        <span className="text-3xs text-muted-foreground truncate font-mono">
          {cssVar}
        </span>
      </Stack>

      {isColor ? (
        <Text
          as="span"
          variant="caption"
          className="font-mono text-muted-foreground tabular-nums"
        >
          {value}
        </Text>
      ) : (
        <input
          ref={inputRef}
          type="text"
          className="text-caption font-mono bg-transparent border border-transparent rounded-md px-xs py-2xs text-right max-w-[160px] focus:border-border focus:bg-background focus:outline-none"
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          onBlur={handleTextBlur}
          onKeyDown={handleTextKeyDown}
        />
      )}

      {isSplit && (
        <span
          title="Light and dark values differ"
          // eslint-disable-next-line layout/no-adhoc-layout -- rigid fixed-size indicator + clipped gradient fill; rigid leaf of Row's flex
          className="shrink-0 size-3 rounded-full border border-muted-foreground/40 overflow-hidden"
          style={{
            background:
              "linear-gradient(to right, oklch(0.95 0 0) 50%, oklch(0.25 0 0) 50%)",
          }}
        />
      )}

      <button
        type="button"
        onClick={onReset}
        title="Reset to preset value"
        // eslint-disable-next-line layout/no-adhoc-layout -- rigid reset affordance; rigid leaf of Row's flex
        className={`shrink-0 text-muted-foreground hover:text-foreground transition-opacity ${
          isOverridden
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-30 pointer-events-none"
        }`}
        aria-hidden={!isOverridden}
      >
        <MdUndo size={14} />
      </button>
    </Row>
  );
}
