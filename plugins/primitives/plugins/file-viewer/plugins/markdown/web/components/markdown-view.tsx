import {
  useFileText,
  fileTextUnavailableMessage,
  type FileRendererProps,
} from "@plugins/primitives/plugins/file-viewer/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { splitFrontmatter } from "../internal/frontmatter";
import { FrontmatterCard } from "./frontmatter-card";

export function MarkdownView({ file }: FileRendererProps) {
  const state = useFileText(file);

  if (state.kind === "loading") {
    return <Loading />;
  }
  if (state.kind === "unavailable") {
    return (
      <Placeholder tone="error">
        {fileTextUnavailableMessage(state.reason)}
      </Placeholder>
    );
  }
  if (state.kind === "error") {
    return (
      <Placeholder tone="error">
        {state.message || "Failed to load file."}
      </Placeholder>
    );
  }

  const split = splitFrontmatter(state.content);

  return (
    <Text as="div" variant="body" className="px-lg py-md">
      {split && <FrontmatterCard fields={split.fields} />}
      {(split ? split.body : state.content).trim() && (
        <Markdown>{split ? split.body : state.content}</Markdown>
      )}
    </Text>
  );
}
