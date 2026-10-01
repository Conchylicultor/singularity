import {
  ResourceErrorInline,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  ControlPanel,
  ControlPanelPopover,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import {
  Button,
  cn,
  useControlSize,
  type ControlSize,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Icon } from "@plugins/ui/plugins/icons/web";
import {
  pagesResource,
  pageData,
  pageKindOf,
  setPageKind,
  type PageKind,
} from "@plugins/page/plugins/editor/core";
import { pageDetailPane } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { symbol, type IconRef } from "@plugins/ui/plugins/icons/core";

const autoAwesomeIcon = symbol("auto-awesome");
const descriptionIcon = symbol("description");
const menuBookIcon = symbol("menu-book");
const expandIcon = symbol("expand-more");

/**
 * The box the labelled pill occupies at each density — the control's height and
 * about the width of "Page ▾" — so the placeholder holds the pill's place in the
 * strip and nothing jumps when it arrives. Spelled out per density because
 * Tailwind only emits class names it can see as literals (a
 * `control-${size}` template would compile to nothing).
 */
const PILL_BOX: Record<ControlSize, string> = {
  xs: "control-xs w-16",
  sm: "control-sm w-20",
  md: "control-md w-20",
  lg: "control-lg w-24",
};

/** How the control shows each kind: its icon, its name, and its pressed tint. */
const KIND_LOOK: Record<
  PageKind["kind"],
  {
    icon: IconRef;
    label: string;
    hint: string;
    tint: string | null;
  }
> = {
  page: {
    icon: descriptionIcon,
    label: "Page",
    hint: "An ordinary page: agents may read it and never write it.",
    tint: null,
  },
  "agent-page": {
    icon: autoAwesomeIcon,
    label: "Agent page",
    hint: "Agents can write all of it.",
    // The `info` wash agent notes wear.
    tint: "bg-info/10 text-info hover:bg-info/20 hover:text-info",
  },
  instructions: {
    icon: menuBookIcon,
    label: "Instructions",
    hint: "Your standing instructions to every agent working under the parent page.",
    // The `primary` wash the inline `<instructions>` card wears.
    tint: "bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary",
  },
};

const KIND_ORDER: readonly PageKind["kind"][] = [
  "page",
  "agent-page",
  "instructions",
];

/** The kind a radio row selects — a fresh instructions page starts non-global. */
function kindFor(k: PageKind["kind"]): PageKind {
  return k === "instructions"
    ? { kind: "instructions", global: false }
    : { kind: k };
}

/**
 * The page-kind control contributed to `pageDetailPane.Actions` — by the
 * user's choice, the ONLY thing on the open page that says what kind of page it
 * is: an ordinary page, an agent page (agents may write all of it), or an
 * instructions page (the human's standing instructions to agents working under
 * the parent page), with a Global switch that hands those instructions to every
 * conversation at its start.
 *
 * One labelled ghost pill — the kind's icon, its name, a chevron — tinted when
 * it is not an ordinary page, opening a small panel of three radio rows (each
 * with its meaning as a visible line: the kind IS a policy, so it is read
 * before it is picked) plus the switch. A
 * choice asks the server to change the page's kind (`setPageKind`, the one way a
 * kind changes after a page is born). It is deliberately not optimistic: the
 * trigger changes when the live `pagesResource` push lands — the same push that
 * re-tints the parent page's row and the sidebar.
 *
 * While the pages resource is still loading it renders a placeholder the size of
 * the pill, never the pill: that would claim a kind before anything is known.
 */
export function PageKindControl() {
  const { pageId } = pageDetailPane.useParams();
  const size = useControlSize();
  const result = useResource(pagesResource);
  const { mutateAsync } = useEndpointMutation(setPageKind);

  if (result.status === "loading") {
    return <Loading variant="block" className={PILL_BOX[size]} />;
  }
  if (result.status === "error") {
    return (
      <ResourceErrorInline
        variant="icon"
        icon={descriptionIcon}
        subject="the page kind"
        error={result.error}
        refetch={result.refetch}
      />
    );
  }
  const page = result.data.find((p) => p.id === pageId);
  if (!page) return null;
  const kind = pageKindOf(pageData(page));
  const look = KIND_LOOK[kind.kind];

  const choose = async (next: PageKind) => {
    await mutateAsync({ params: { id: pageId }, body: { kind: next } });
  };

  return (
    <ControlPanelPopover
      size="menu"
      align="end"
      label="Page kind"
      trigger={
        // No tooltip: the label names the kind, and the panel it opens reads
        // out what each kind means.
        <Button
          variant="ghost"
          aria-label={`Page kind: ${look.label}`}
          aria-pressed={kind.kind !== "page"}
          className={cn("text-muted-foreground", look.tint)}
        >
          <Icon icon={look.icon} />
          {look.label}
          <Icon icon={expandIcon} />
        </Button>
      }
    >
      <ControlPanel.Section label="Page kind">
        {KIND_ORDER.map((k) => (
          <ControlPanel.Row
            key={k}
            select="radio"
            checked={kind.kind === k}
            description={KIND_LOOK[k].hint}
            onSelect={() => {
              if (kind.kind !== k) void choose(kindFor(k));
            }}
          >
            {KIND_LOOK[k].label}
          </ControlPanel.Row>
        ))}
      </ControlPanel.Section>
      {kind.kind === "instructions" && (
        <ControlPanel.Section>
          <ControlPanel.Row
            select="switch"
            checked={kind.global}
            description="Hand these instructions to every agent conversation at its start, wherever it works."
            onSelect={() => {
              void choose({ kind: "instructions", global: !kind.global });
            }}
          >
            Global
          </ControlPanel.Row>
        </ControlPanel.Section>
      )}
    </ControlPanelPopover>
  );
}
