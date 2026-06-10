import { Row } from "@plugins/primitives/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/text/web";

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
    <div className="flex h-full flex-col gap-1 p-3">
      <Text as="div" variant="caption" className="mb-1 text-muted-foreground">
        Multiple files match{" "}
        <span className="font-mono font-medium text-foreground">{query}</span>
      </Text>
      <div className="min-h-0 flex-1 overflow-auto">
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
      </div>
    </div>
  );
}
