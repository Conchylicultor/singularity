import { useContext, useMemo, type ReactNode } from "react";
import ReactMarkdownLib from "react-markdown";
import remarkGfm from "remark-gfm";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { MarkdownEnhancementContext } from "./enhancement-context";
import { buildBaseComponents, stripNodeProp } from "./base-components";

const REMARK_PLUGINS = [remarkGfm];

// The heavy renderer: react-markdown + remark-gfm + the base component map
// (which pulls in the syntax highlighter). Lives in its own module so
// `markdown.tsx` can load it through a `lazyComponent()` dynamic import,
// keeping react-markdown (~151KB) off the eager plugin-boot wave — it loads
// once, on the first markdown render of the session.
export function MarkdownRenderer({ children }: { children: string }) {
  const enhancement = useContext(MarkdownEnhancementContext);
  const { components: overrides } = enhancement;

  // Keep the live context value in a ref so the stable accessors below read the
  // latest transforms / inline-code handlers at call time without forcing any
  // component identity to change.
  const ref = useLatestRef(enhancement);

  // Base map built ONCE: every base tag — including `code` — gets a permanent
  // identity, so react-markdown never remounts them on a re-render. The
  // accessors read the stable `ref.current`, so live data is reflected in place
  // while the map is still built exactly once.
  const base = useMemo(
    () =>
      stripNodeProp(
        buildBaseComponents(
          // eslint-disable-next-line react-hooks/refs -- the accessor runs at react-markdown render time (not this hook's render); reading the latest transforms off the stable ref is what keeps the base map built ONCE while still reflecting live data
          (c: ReactNode) => ref.current.transforms.reduce((acc, fn) => fn(acc), c),
          // eslint-disable-next-line react-hooks/refs -- same: latest inline-code handlers read at call time off the stable ref, never during this hook's render
          () => ref.current.inlineCodeHandlers,
        ),
      ),
    [],
  );

  // Overrides re-wrap only when the override map actually changes; `code` lives
  // only in `base`, so its identity is constant forever.
  const strippedOverrides = useMemo(() => stripNodeProp(overrides), [overrides]);

  const components = useMemo(
    () => ({ ...base, ...strippedOverrides }),
    [base, strippedOverrides],
  );

  // Memoize the rendered tree on its stable inputs. react-markdown's `Markdown`
  // is not itself memoized, so without this a parent re-render (e.g. the idle
  // conversation-view churning ~5/s off a no-op live-state push) re-creates this
  // element, re-runs the full markdown parse + every `transform`, and reconciles
  // the whole subtree — producing childList DOM churn on `<p>`/`<a>` and every
  // other tag even when nothing changed. Pinning the element to a stable
  // reference makes React skip the subtree entirely on such re-renders (true
  // no-op). The only inputs that change the output are the source string
  // (`children`) and the merged component map (`components`, which already
  // collapses the base map + overrides); transforms / inline-code handlers are
  // read off `ref.current` and only ever change alongside `overrides` (→
  // `components`) or a new `children`, so those two deps invalidate the memo
  // exactly when the output would differ. Live inline widgets (active-data
  // chips) inside the frozen tree still update themselves via their own
  // subscriptions; they don't depend on this component re-rendering.
  return useMemo(
    () => (
      <ReactMarkdownLib remarkPlugins={REMARK_PLUGINS} components={components}>
        {children}
      </ReactMarkdownLib>
    ),
    [children, components],
  );
}
