import { MdArrowForward, MdMyLocation } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Badge, type BadgeVariant } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { Section, type PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/web";
import {
  useActiveComposition,
  useEnsureCompositionData,
  useInclusion,
  useImpact,
  pinAsRoot,
} from "@plugins/plugin-meta/plugins/composition/web";
import type {
  InclusionStep,
  MembershipState,
} from "@plugins/plugin-meta/plugins/closure/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";

const STATE_BADGE: Record<MembershipState, { variant: BadgeVariant; label: string }> = {
  entry: { variant: "primary", label: "Entry point" },
  required: { variant: "primary", label: "Required" },
  contributor: { variant: "success", label: "Contributor" },
  "via-contributor": { variant: "success", label: "Via contributor" },
  available: { variant: "info", label: "Available" },
  excluded: { variant: "muted", label: "Excluded" },
};

function shortName(id: PluginId): string {
  const s = String(id);
  const dot = s.lastIndexOf(".");
  return dot === -1 ? s : s.slice(dot + 1);
}

function PinButton({ id }: { id: PluginId }) {
  return (
    <Button variant="outline" size="sm" onClick={() => pinAsRoot(id)}>
      <MdMyLocation />
      Show closure from here
    </Button>
  );
}

function ImpactList({ title, ids }: { title: string; ids: PluginId[] }) {
  return (
    <Stack gap="2xs">
      <Text variant="caption" tone="muted">
        {title} ({ids.length})
      </Text>
      {ids.length > 0 && (
        <div className="flex flex-wrap gap-xs">
          {ids.map((id) => (
            <Badge key={id} size="sm" variant="muted" title={String(id)}>
              {shortName(id)}
            </Badge>
          ))}
        </div>
      )}
    </Stack>
  );
}

export function InclusionSection({ node }: { node: PluginNode }) {
  useEnsureCompositionData();
  const active = useActiveComposition();
  const inclusion = useInclusion(node);
  const impact = useImpact(node);

  if (!active) {
    return (
      <Section title="Composition membership">
        <Stack gap="sm">
          <Text variant="caption" tone="muted">
            No active composition. Pin this plugin to visualize the bundle closed
            from it across the whole tree.
          </Text>
          <div>
            <PinButton id={node.id} />
          </div>
        </Stack>
      </Section>
    );
  }

  const state: MembershipState = inclusion?.state ?? "excluded";
  const badge = STATE_BADGE[state];

  return (
    <Section title="Composition membership">
      <Stack gap="md">
        <div className="flex items-center gap-sm">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          <Text variant="caption" tone="muted">
            in <span className="font-medium">{active.name}</span>
          </Text>
        </div>

        {inclusion ? (
          <Stack gap="2xs">
            <Text variant="caption" tone="muted">
              Why bundled — from{" "}
              <span className="font-mono">{shortName(inclusion.origin)}</span> (
              {inclusion.originKind})
            </Text>
            {inclusion.steps.length > 0 ? (
              <div className="flex flex-wrap items-center gap-xs">
                {inclusion.steps.map((step, i) => (
                  <EdgeChip key={`${step.from}-${step.to}-${i}`} step={step} />
                ))}
              </div>
            ) : (
              <Text variant="caption" tone="muted">
                Directly seeded — no edges to traverse.
              </Text>
            )}
          </Stack>
        ) : (
          <Text variant="caption" tone="muted">
            Not bundled by this composition.
          </Text>
        )}

        {impact && (
          <Stack gap="sm">
            <ImpactList title="Selecting adds" ids={impact.select} />
            <ImpactList title="Deselecting drops" ids={impact.prune} />
          </Stack>
        )}

        <div>
          <PinButton id={node.id} />
        </div>
      </Stack>
    </Section>
  );
}

function EdgeChip({ step }: { step: InclusionStep }) {
  return (
    <span className="inline-flex items-center gap-xs">
      <LinkChip mono onClick={() => pinAsRoot(step.from)} title={String(step.from)}>
        {shortName(step.from)}
      </LinkChip>
      <MdArrowForward className="size-3 shrink-0 text-muted-foreground" />
      <Badge size="sm" variant={step.kind === "hard" ? "primary" : "info"}>
        {step.kind}
      </Badge>
      <MdArrowForward className="size-3 shrink-0 text-muted-foreground" />
      <LinkChip mono onClick={() => pinAsRoot(step.to)} title={String(step.to)}>
        {shortName(step.to)}
      </LinkChip>
    </span>
  );
}
