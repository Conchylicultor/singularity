import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useTokenGroupEditor } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import {
  ICON_FILLS,
  ICON_SHAPES,
  ICON_WEIGHTS,
  symbol,
} from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";
import { iconsGroup } from "../../core";

type IconToken = keyof typeof iconsGroup.schema;

// Every icon token is a closed choice, so each is a segmented control rather
// than the free-text row other groups use.
const TOKENS: readonly {
  token: IconToken;
  label: string;
  options: readonly string[];
}[] = [
  { token: "iconShape", label: "Shape", options: ICON_SHAPES },
  { token: "iconFill", label: "Fill", options: ICON_FILLS },
  { token: "iconActiveFill", label: "Fill when active", options: ICON_FILLS },
  { token: "iconStroke", label: "Stroke", options: ICON_WEIGHTS },
];

// A few glyphs drawn in the scope's current style, at rest and active.
const PREVIEW = [
  symbol("home"),
  symbol("forum"),
  symbol("settings"),
  symbol("keep"),
];

const optionLabel = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

function matches(search: string, token: IconToken, label: string): boolean {
  const q = search.trim().toLowerCase();
  return (
    !q || label.toLowerCase().includes(q) || iconsGroup.vars[token].includes(q)
  );
}

function TokenChoice({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Row
      actionsAlwaysVisible
      actions={
        <SegmentedControl
          options={options.map((id) => ({ id, label: optionLabel(id) }))}
          value={value}
          onChange={onChange}
        />
      }
    >
      <Text as="span" variant="label">
        {label}
      </Text>
    </Row>
  );
}

export function IconsSection({ search }: { search: string }) {
  const editor = useTokenGroupEditor(iconsGroup);
  if (editor.pending) return <Loading variant="rows" count={TOKENS.length} />;

  // "both" edits light and dark together; the light value is what it shows.
  const shown = editor.values[editor.mode === "dark" ? "dark" : "light"];
  return (
    <Stack gap="xs">
      <Row
        actionsAlwaysVisible
        actions={
          <Stack direction="row" gap="sm">
            {PREVIEW.map((icon) => (
              <Icon key={icon.name} icon={icon} className="size-5" />
            ))}
            {PREVIEW.map((icon) => (
              <Icon
                key={`${icon.name}-active`}
                icon={icon}
                active
                className="size-5"
              />
            ))}
          </Stack>
        }
      >
        <Text as="span" variant="label">
          Preview (at rest, active)
        </Text>
      </Row>
      {TOKENS.filter(({ token, label }) => matches(search, token, label)).map(
        ({ token, label, options }) => (
          <TokenChoice
            key={token}
            label={label}
            options={options}
            value={shown[token]!}
            onChange={(value) => editor.setToken(token, value)}
          />
        ),
      )}
    </Stack>
  );
}
