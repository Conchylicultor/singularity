import type { ReactNode } from "react";
import type { Components } from "react-markdown";
import { HighlightedCode } from "@plugins/primitives/plugins/syntax-highlight/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { langFromClassName, nodeToText } from "./helpers";

export function buildBaseComponents(
  transform: (children: ReactNode) => ReactNode,
  inlineCodeHandlers: Array<(text: string) => ReactNode | null>,
): Components {
  return {
    h1: ({ children, ...p }) => (
      // eslint-disable-next-line spacing/no-adhoc-spacing -- markdown block rhythm; siblings rendered independently by react-markdown
      <Text as="h1" variant="title" className="mt-4 mb-2" {...p}>
        {transform(children)}
      </Text>
    ),
    h2: ({ children, ...p }) => (
      // eslint-disable-next-line spacing/no-adhoc-spacing -- markdown block rhythm; siblings rendered independently by react-markdown
      <Text as="h2" variant="title" className="mt-4 mb-2" {...p}>
        {transform(children)}
      </Text>
    ),
    h3: ({ children, ...p }) => (
      // eslint-disable-next-line spacing/no-adhoc-spacing -- markdown block rhythm; siblings rendered independently by react-markdown
      <Text as="h3" variant="heading" className="mt-3 mb-1.5" {...p}>
        {transform(children)}
      </Text>
    ),
    h4: ({ children, ...p }) => (
      // eslint-disable-next-line spacing/no-adhoc-spacing -- markdown block rhythm; siblings rendered independently by react-markdown
      <Text as="h4" variant="subheading" className="mt-3 mb-1" {...p}>
        {transform(children)}
      </Text>
    ),
    p: ({ children, ...p }) => (
      // eslint-disable-next-line spacing/no-adhoc-spacing -- markdown block rhythm; siblings rendered independently by react-markdown
      <p className="my-2" {...p}>
        {transform(children)}
      </p>
    ),
    a: ({ href, ...p }) => (
      <a
        className="text-primary underline"
        href={href}
        target={href?.startsWith("http") ? "_blank" : undefined}
        rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
        {...p}
      />
    ),
    // eslint-disable-next-line spacing/no-adhoc-spacing -- markdown block rhythm (my-2); list indent kept as pl-xl
    ul: (p) => <ul className="my-2 list-disc pl-xl" {...p} />,
    // eslint-disable-next-line spacing/no-adhoc-spacing -- markdown block rhythm (my-2); list indent kept as pl-xl
    ol: (p) => <ol className="my-2 list-decimal pl-xl" {...p} />,
    li: ({ children, ...p }) => (
      // eslint-disable-next-line spacing/no-adhoc-spacing -- markdown list-item rhythm; siblings rendered independently by react-markdown
      <li className="my-0.5" {...p}>
        {transform(children)}
      </li>
    ),
    blockquote: ({ children, ...p }) => (
      <blockquote
        // eslint-disable-next-line spacing/no-adhoc-spacing -- markdown block rhythm (my-2); blockquote indent kept as pl-md
        className="my-2 border-l-2 border-muted-foreground/30 pl-md text-muted-foreground"
        {...p}
      >
        {transform(children)}
      </blockquote>
    ),
    // eslint-disable-next-line spacing/no-adhoc-spacing -- markdown block rhythm; siblings rendered independently by react-markdown
    hr: (p) => <hr className="my-4 border-border" {...p} />,
    code: ({ className, children, ...rest }) => {
      const lang = langFromClassName(className);
      const text = nodeToText(children).replace(/\n$/, "");
      const isBlock = lang !== null || text.includes("\n");
      if (isBlock) {
        return <HighlightedCode code={text} lang={lang} />;
      }
      for (const handler of inlineCodeHandlers) {
        const result = handler(text);
        if (result !== null) return <>{result}</>;
      }
      return (
        <code
          className="rounded-md bg-muted px-xs py-2xs font-mono text-caption"
          {...rest}
        >
          {children}
        </code>
      );
    },
    pre: ({ children }) => <>{children}</>,
    // eslint-disable-next-line spacing/no-adhoc-spacing -- markdown block rhythm; siblings rendered independently by react-markdown
    table: (p) => <table className="my-2 w-full border-collapse" {...p} />,
    th: ({ children, ...p }) => (
      <th
        className="border border-border bg-muted px-sm py-xs text-left"
        {...p}
      >
        {transform(children)}
      </th>
    ),
    td: ({ children, ...p }) => (
      <td className="border border-border px-sm py-xs" {...p}>
        {transform(children)}
      </td>
    ),
  };
}
