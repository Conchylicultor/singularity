import {
  CommitRail,
  CommitRowItem,
  COMMIT_ROW_HEIGHT,
} from "@plugins/primitives/plugins/commit-list/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import type React from "react";
import { sameCommit, type Carrier } from "../../core";
import {
  CARRIER_LABEL,
  carrierMarkers,
  hasOtherBytes,
  isAtCommit,
  servedGraph,
} from "./carrier-badge";
import { useDeployment } from "./use-deployment";

// Two bands, mirroring the conversation commits-graph: the stretch nothing has
// picked up yet, and the stretch that is running somewhere.
const TO_DEPLOY_COLOR = "var(--primary)";
const DEPLOYED_COLOR = "var(--success)";

function short(sha: string): string {
  return sha.slice(0, 7);
}

/**
 * The verdict's colour. A class map rather than `Text`'s `tone` prop, which has
 * no `success` arm — and "everything is deployed" is exactly the statement that
 * needs one.
 */
const TONE_CLASS = {
  success: "text-success",
  primary: "text-primary",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
} as const;

/**
 * Why a carrier can hold a commit that has no row: the chain runs from the
 * oldest DEPLOYABLE pin to the target, and the tab is not a deployable carrier,
 * so it can sit further back than either of them.
 */
const OFF_CHAIN_TITLE =
  "The chain above runs from the oldest deployed commit up to HEAD. This carrier's commit is not in it — normally an older one, because only a reload moves a tab forward.";

/** The section shell: one label, one verdict, and whatever evidence the arm has. */
function Section({
  summary,
  tone,
  children,
}: {
  summary: string;
  tone: keyof typeof TONE_CLASS;
  children: React.ReactNode;
}) {
  return (
    <Stack gap="none" className="border-b">
      <Line className="gap-sm px-md py-sm">
        <Text as="span" variant="label" className="text-muted-foreground">
          Deployment
        </Text>
        {/* An empty Fill absorbs the slack, so the verdict sits in its own
            flush-right track rather than floating over the label. */}
        <Fill />
        <Text as="span" variant="caption" className={TONE_CLASS[tone]}>
          {summary}
        </Text>
      </Line>
      {children}
    </Stack>
  );
}

/**
 * A commit row for a sha with no `CommitRow` behind it — the converged arm,
 * where the payload carries the target sha but no log walk (there is nothing to
 * walk: everything is on it). Rendered with the same rail and row height as the
 * chain so the two arms are one visual language.
 */
function PinRow({
  sha,
  markers,
}: {
  sha: string;
  markers: React.ReactNode | undefined;
}) {
  return (
    <Line
      as="li"
      className="gap-sm border-b border-border/50 pl-sm pr-md"
      style={{ height: COMMIT_ROW_HEIGHT }}
    >
      <CommitRail isFirst isLast color={DEPLOYED_COLOR} />
      <Text
        as="span"
        variant="caption"
        className="font-mono text-muted-foreground"
        title={sha}
      >
        {short(sha)}
      </Text>
      <Fill as="span">
        <Text as="span" variant="caption" tone="muted">
          HEAD
        </Text>
      </Fill>
      {markers}
    </Line>
  );
}

/**
 * The carriers that landed on no row at all, rendered explicitly BELOW the
 * chain rather than dropped.
 *
 * Dropping one would be the worst kind of quiet: a missing badge reads as "there
 * is no such carrier", and "this tab has no bundle" is never true of a tab you
 * are looking at. So each one still says its name, and then either its commit
 * (with the reason it has no row) or the reason it cannot name a commit at all.
 */
function OffChain({ carriers }: { carriers: Carrier[] }) {
  if (carriers.length === 0) return null;
  return (
    <Stack gap="2xs" className="px-md py-sm">
      {carriers.map((c) => (
        <Line key={c.id} className="gap-sm">
          <Badge variant="muted">{CARRIER_LABEL[c.id]}</Badge>
          {c.commit.resolved ? (
            <>
              <Text
                as="span"
                variant="caption"
                className="font-mono"
                title={c.commit.value}
              >
                {short(c.commit.value)}
              </Text>
              <Text
                as="span"
                variant="caption"
                tone="muted"
                title={OFF_CHAIN_TITLE}
              >
                not among the commits above
              </Text>
            </>
          ) : (
            <Text
              as="span"
              variant="caption"
              tone="muted"
              title={c.commit.reason}
            >
              {c.commit.reason}
            </Text>
          )}
        </Line>
      ))}
    </Stack>
  );
}

/**
 * Every pin, flat — the shape both unanswerable arms fall back to. There is no
 * line to draw on either (`diverged` carries no chain because there is no line;
 * `unknown` has no target to draw one toward), but the pins are still facts and
 * are still worth reading.
 */
function PinList({
  carriers,
  target,
  served,
}: {
  carriers: Carrier[];
  target: string | null;
  served: string | null;
}) {
  return (
    <Stack gap="2xs" className="px-md py-sm">
      {target !== null && (
        <Line className="gap-sm">
          <Badge variant="primary">HEAD</Badge>
          <Text
            as="span"
            variant="caption"
            className="font-mono"
            title={target}
          >
            {short(target)}
          </Text>
        </Line>
      )}
      {carriers.map((c) => (
        <Line key={c.id} className="gap-sm">
          <Badge
            variant={
              target !== null && isAtCommit(c, target) ? "success" : "muted"
            }
          >
            {CARRIER_LABEL[c.id]}
          </Badge>
          {c.commit.resolved ? (
            <Text
              as="span"
              variant="caption"
              className="font-mono"
              title={c.commit.value}
            >
              {short(c.commit.value)}
            </Text>
          ) : (
            <Text
              as="span"
              variant="caption"
              tone="muted"
              title={c.commit.reason}
            >
              {c.commit.reason}
            </Text>
          )}
          {hasOtherBytes(c, served) && (
            <Badge variant="warning">other bytes</Badge>
          )}
        </Line>
      ))}
    </Stack>
  );
}

/**
 * What is deployed, as one chain of commits with a chip per carrier on the
 * commit it is actually on.
 *
 * Four arms, one per arm of the payload's own discriminated union — the arm is
 * NOT re-derived here. Each renders the evidence its arm genuinely carries, and
 * nothing it does not: `diverged` draws no line because there is none, and
 * `unknown` shows the pins plus the reason rather than an empty chain, which
 * would read as the one thing it does not mean ("nothing to deploy").
 *
 * Sized for the Build popover — global chrome, a few hundred pixels wide — so
 * the chain scrolls inside itself rather than growing the panel without bound.
 */
export function DeploymentChain() {
  const reading = useDeployment();

  if (reading.pending) {
    if (reading.error) {
      return (
        <Placeholder tone="error">
          Failed to read the deployment: {reading.error.message}
        </Placeholder>
      );
    }
    return <Loading variant="rows" count={2} />;
  }

  const { state, carriers } = reading;
  const served = servedGraph(carriers);

  if (state.kind === "unknown") {
    return (
      <Section summary="No checkout" tone="muted">
        <Placeholder>
          {state.reason} — so there is no commit to converge toward. The pins
          below are still facts.
        </Placeholder>
        <PinList carriers={carriers} target={null} served={served} />
      </Section>
    );
  }

  if (state.kind === "diverged") {
    return (
      <Section summary="App diverged" tone="destructive">
        <Placeholder>
          A carrier is on a commit that is not on the way to{" "}
          <span className="font-mono">{short(state.target)}</span> — the
          checkout was rebased or force-pushed under the running app. There is
          no line to draw, so here are the raw pins.
        </Placeholder>
        <PinList carriers={carriers} target={state.target} served={served} />
      </Section>
    );
  }

  if (state.kind === "converged") {
    const here = carriers.filter((c) => isAtCommit(c, state.target));
    const elsewhere = carriers.filter((c) => !isAtCommit(c, state.target));
    // A tab holding older bytes is the ordinary case here — the deployable
    // carriers converged and nobody reloaded — so the verdict names what is
    // converged rather than claiming the whole app is.
    const summary = elsewhere.length === 0 ? "Up to date" : "Deployed";
    return (
      <Section summary={summary} tone="success">
        <ol>
          <PinRow
            sha={state.target}
            markers={carrierMarkers(here, state.target, served)}
          />
        </ol>
        <OffChain carriers={elsewhere} />
      </Section>
    );
  }

  // `behind`: the chain, one badge per carrier on ITS OWN commit's row.
  const rows = state.commits;

  // No readable pin at all (a fresh checkout with no dist, or a mixed boot on
  // both carriers): `behind` still holds, but there is no line to draw from.
  // Rendering the flat pins here rather than an empty chain — an empty chain is
  // the one thing this must never look like, "nothing to deploy".
  if (rows.length === 0) {
    return (
      <Section summary="Nothing deployed yet" tone="primary">
        <PinList carriers={carriers} target={state.target} served={served} />
      </Section>
    );
  }

  // The narrowed sha is given a NAME rather than read inside the callback:
  // `c.commit.resolved` narrows `c.commit` here, but the closure re-widens it to
  // the union, so the discriminated union stays honest only if the value is
  // pulled out first. That is the union doing its job, not an obstacle to cast
  // around.
  const rowOf = (c: Carrier): number => {
    if (!c.commit.resolved) return -1;
    const sha = c.commit.value;
    return rows.findIndex((r) => sameCommit(r.sha, sha));
  };

  // Each carrier lands on the row of the commit it is actually on. A carrier
  // that lands nowhere is NOT dropped — the chain starts at the oldest
  // DEPLOYABLE pin, and the tab is not one, so it can sit further back than any
  // row shown. `OffChain` below renders those explicitly.
  const placed = new Map<number, Carrier[]>();
  const elsewhere: Carrier[] = [];
  for (const c of carriers) {
    const idx = rowOf(c);
    if (idx < 0) elsewhere.push(c);
    else placed.set(idx, [...(placed.get(idx) ?? []), c]);
  }

  // The band boundary: the newest row a DEPLOYABLE carrier sits on. Everything
  // above it is running nowhere; everything from it down is running in at least
  // one of the two. A tab never moves this line — a tab is not something a
  // build deploys.
  const deployedIndices = state.deployable.map(rowOf).filter((i) => i >= 0);
  const firstDeployed =
    deployedIndices.length > 0 ? Math.min(...deployedIndices) : -1;
  const toDeploy = firstDeployed >= 0 ? firstDeployed : rows.length;

  return (
    <Section
      summary={`${toDeploy} ${toDeploy === 1 ? "commit" : "commits"} to deploy`}
      tone="primary"
    >
      {/* The chain is bounded by how far a checkout drifts between builds, but
          that is not a small number after a quiet week — so it scrolls in its
          own box instead of turning the popover into a wall. */}
      <Scroll axis="y" className="max-h-48">
        <ol>
          {rows.map((commit, idx) => (
            <CommitRowItem
              key={commit.sha}
              commit={commit}
              isFirst={idx === 0}
              isLast={idx === rows.length - 1}
              color={
                firstDeployed >= 0 && idx >= firstDeployed
                  ? DEPLOYED_COLOR
                  : TO_DEPLOY_COLOR
              }
              markers={carrierMarkers(
                placed.get(idx) ?? [],
                state.target,
                served,
              )}
            />
          ))}
        </ol>
      </Scroll>
      <OffChain carriers={elsewhere} />
    </Section>
  );
}
