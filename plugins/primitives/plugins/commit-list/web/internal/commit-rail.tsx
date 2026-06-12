import { Text } from "@plugins/primitives/plugins/text/web";

interface Props {
  isFirst: boolean;
  isLast: boolean;
  color: string;
}

const ROW_HEIGHT = 36;
const RAIL_X = 14;
const DOT_RADIUS = 5;

// Single-rail SVG. Top of rail extends above the first row to suggest the
// branch continuing upward; bottom of the last row connects into the
// merge-base marker below the list.
export function CommitRail({ isFirst, isLast, color }: Props) {
  const top = isFirst ? ROW_HEIGHT / 2 : 0;
  const bottom = isLast ? ROW_HEIGHT / 2 : ROW_HEIGHT;
  return (
    <svg
      width={28}
      height={ROW_HEIGHT}
      viewBox={`0 0 28 ${ROW_HEIGHT}`}
      aria-hidden="true"
      className="shrink-0"
    >
      <line
        x1={RAIL_X}
        y1={top}
        x2={RAIL_X}
        y2={bottom}
        stroke={color}
        strokeWidth={2}
      />
      <circle
        cx={RAIL_X}
        cy={ROW_HEIGHT / 2}
        r={DOT_RADIUS}
        fill={color}
      />
    </svg>
  );
}

// Marker rendered below the last commit row, at the merge-base point. Shows
// the rail terminating into a smaller "main" dot, mirroring VSCode Git Graph.
export function MergeBaseMarker({
  color,
  mainColor,
  shortSha,
  hasPending,
}: {
  color: string;
  mainColor: string;
  shortSha: string | null;
  hasPending: boolean;
}) {
  const ROW = ROW_HEIGHT;
  return (
    <Text as="li" variant="caption" className="flex items-center text-muted-foreground">
      <svg
        width={28}
        height={ROW}
        viewBox={`0 0 28 ${ROW}`}
        aria-hidden="true"
        className="shrink-0"
      >
        {hasPending && (
          <line
            x1={RAIL_X}
            y1={0}
            x2={RAIL_X}
            y2={ROW / 2}
            stroke={color}
            strokeWidth={2}
          />
        )}
        <line
          x1={RAIL_X}
          y1={ROW / 2}
          x2={RAIL_X}
          y2={ROW}
          stroke={mainColor}
          strokeWidth={2}
          strokeDasharray="3 3"
        />
        <circle
          cx={RAIL_X}
          cy={ROW / 2}
          r={DOT_RADIUS - 1}
          fill={mainColor}
        />
      </svg>
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- per-label offset from the rail svg; non-uniform with the svg sibling */}
      <span className="ml-2 font-mono">{shortSha ?? "main"}</span>
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- per-label offset between sha and merge-base text */}
      <span className="ml-2">merge-base</span>
    </Text>
  );
}

export const COMMIT_ROW_HEIGHT = ROW_HEIGHT;
