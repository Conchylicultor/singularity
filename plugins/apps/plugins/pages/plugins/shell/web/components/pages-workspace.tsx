import type { ReactNode } from "react";
import {
  accountFirstName,
  accountInitial,
  type HostAccount,
} from "@plugins/infra/plugins/host-account/core";
import { useHostAccount } from "@plugins/infra/plugins/host-account/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { ResourceErrorInline } from "@plugins/primitives/plugins/live-state/web";

/**
 * The mockup's 10px (the sidebar's top inset, the tile-to-name gap) and 6px
 * (the row's block padding), each spelled as a sum of density-ramp steps
 * (`sm` + `2xs`, `xs` + `2xs`) so the header scales with the density preset
 * like every other gap.
 */
const SPACE_10 = "calc(var(--space-sm) + var(--space-2xs))";
const SPACE_6 = "calc(var(--space-xs) + var(--space-2xs))";
const LINE_STYLE = { columnGap: SPACE_10, paddingBlock: SPACE_6 };
const TOP_STYLE = { paddingTop: SPACE_10 };

/** The 22px initial tile. */
const TILE = cn(
  "size-[22px] rounded-control border border-border bg-selected",
  rigidClass(),
);

/**
 * The Pages sidebar's head: the user's initial in a small tile, then
 * "<first name>'s pages" — the workspace the sidebar below belongs to. The
 * name is the OS account's (`infra/host-account`); until it arrives the row
 * keeps its height and shows a loading shimmer, never a placeholder name. No
 * dropdown: there is one workspace.
 */
export function PagesWorkspace() {
  const account = useHostAccount();
  let body: ReactNode;
  switch (account.status) {
    case "loading":
      // The row's own shape — the tile and a name-length bar — so it keeps its
      // height and nothing below it moves when the name lands.
      body = (
        <>
          <Loading variant="block" className={TILE} />
          <Loading variant="block" className="h-3 w-28" />
        </>
      );
      break;
    case "error":
      body = (
        <ResourceErrorInline
          variant="inline"
          subject="your account"
          error={account.error}
          refetch={account.refetch}
        />
      );
      break;
    case "ready":
      body = <WorkspaceName account={account.data} />;
      break;
  }
  return (
    <div className="rail-follow" style={TOP_STYLE}>
      <Line className="px-sm" style={LINE_STYLE}>
        {body}
      </Line>
    </div>
  );
}

function WorkspaceName({ account }: { account: HostAccount }) {
  return (
    <>
      <Center
        as="span"
        axis="both"
        aria-hidden
        className={cn(
          TILE,
          "text-caption font-semibold text-strong-foreground",
        )}
      >
        {accountInitial(account)}
      </Center>
      <Text variant="body" tone="strong" className="font-medium">
        {`${accountFirstName(account)}'s pages`}
      </Text>
    </>
  );
}
