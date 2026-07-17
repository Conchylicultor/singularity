import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

export function FileDisambiguation({
  query,
  matches,
  onSelect,
}: {
  query: string;
  matches: string[];
  onSelect: (path: string) => void;
}) {
  return (
    <Stack gap="xs" className="h-full p-md">
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- bottom offset on heading above the scroll region, larger than the flex gap */}
      <Text as="div" variant="caption" className="mb-1 text-muted-foreground">
        Multiple files match{" "}
        <span className="font-mono font-medium text-foreground">{query}</span>
      </Text>
      <Scroll axis="both" fill>
        {/* eslint-disable-next-line data-view/no-adhoc-row-list -- ambiguous-path candidate picker (transient chrome) */}
        {matches.map((filePath) => {
          const lastSlash = filePath.lastIndexOf("/");
          const dir = lastSlash >= 0 ? filePath.slice(0, lastSlash + 1) : "";
          const name = lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;
          return (
            <Row
              key={filePath}
              size="sm"
              hover="muted"
              onClick={() => onSelect(filePath)}
            >
              <span className="text-muted-foreground">{dir}</span>
              <span className="font-medium text-foreground">{name}</span>
            </Row>
          );
        })}
      </Scroll>
    </Stack>
  );
}
