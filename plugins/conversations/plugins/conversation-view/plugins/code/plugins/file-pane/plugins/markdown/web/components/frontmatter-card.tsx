import { Card } from "@plugins/primitives/plugins/card/web";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Fragment } from "react";
import type { FrontmatterField } from "../internal/frontmatter";

/**
 * Renders a markdown file's YAML frontmatter as a key/value metadata card above
 * the body, instead of letting the `---` fence render as raw `<hr>` + text.
 */
export function FrontmatterCard({ fields }: { fields: FrontmatterField[] }) {
  return (
    // eslint-disable-next-line spacing/no-adhoc-spacing -- bottom offset separating the standalone frontmatter card from the markdown body it precedes
    <Card as="dl" className="mb-4 grid grid-cols-[auto_1fr] gap-x-lg gap-y-xs">
      {fields.map((field) => (
        <Fragment key={field.key}>
          <SectionLabel as="dt" className="pt-2xs">
            {field.key}
          </SectionLabel>
          <Text as="dd" variant="body" className="min-w-0 break-words">
            {field.value}
          </Text>
        </Fragment>
      ))}
    </Card>
  );
}
