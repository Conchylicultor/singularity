import type { ReactNode } from "react";
import type { Components } from "react-markdown";
import { HighlightedCode } from "@plugins/primitives/plugins/syntax-highlight/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { langFromClassName, nodeToText } from "./helpers";

export function buildBaseComponents(
  transform: (children: ReactNode) => ReactNode,
  inlineCodeHandlers: Array<(text: string) => ReactNode | null>,
): Components {
  return {
    h1: ({ children, ...p }) => (
      <Text as="h1" variant="title" className="mt-4 mb-2" {...p}>
        {transform(children)}
      </Text>
    ),
    h2: ({ children, ...p }) => (
      <Text as="h2" variant="title" className="mt-4 mb-2" {...p}>
        {transform(children)}
      </Text>
    ),
    h3: ({ children, ...p }) => (
      <Text as="h3" variant="heading" className="mt-3 mb-1.5" {...p}>
        {transform(children)}
      </Text>
    ),
    h4: ({ children, ...p }) => (
      <Text as="h4" variant="subheading" className="mt-3 mb-1" {...p}>
        {transform(children)}
      </Text>
    ),
    p: ({ children, ...p }) => (
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
    ul: (p) => <ul className="my-2 list-disc pl-6" {...p} />,
    ol: (p) => <ol className="my-2 list-decimal pl-6" {...p} />,
    li: ({ children, ...p }) => (
      <li className="my-0.5" {...p}>
        {transform(children)}
      </li>
    ),
    blockquote: ({ children, ...p }) => (
      <blockquote
        className="my-2 border-l-2 border-muted-foreground/30 pl-3 text-muted-foreground"
        {...p}
      >
        {transform(children)}
      </blockquote>
    ),
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
          className="rounded-md bg-muted px-1 py-0.5 font-mono text-caption"
          {...rest}
        >
          {children}
        </code>
      );
    },
    pre: ({ children }) => <>{children}</>,
    table: (p) => <table className="my-2 w-full border-collapse" {...p} />,
    th: ({ children, ...p }) => (
      <th
        className="border border-border bg-muted px-2 py-1 text-left"
        {...p}
      >
        {transform(children)}
      </th>
    ),
    td: ({ children, ...p }) => (
      <td className="border border-border px-2 py-1" {...p}>
        {transform(children)}
      </td>
    ),
  };
}
