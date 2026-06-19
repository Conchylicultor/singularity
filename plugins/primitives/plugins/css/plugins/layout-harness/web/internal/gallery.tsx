import { type ReactElement, useEffect, useState } from "react";
import {
  loadFixtures,
  type LayoutFixture,
} from "@plugins/primitives/plugins/css/plugins/layout-harness/core";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/section-label/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";

/** Group fixtures by their `primitive`, preserving first-seen order. */
function groupByPrimitive(fixtures: LayoutFixture[]): [string, LayoutFixture[]][] {
  const groups = new Map<string, LayoutFixture[]>();
  for (const f of fixtures) {
    const bucket = groups.get(f.primitive);
    if (bucket) bucket.push(f);
    else groups.set(f.primitive, [f]);
  }
  return [...groups];
}

function dimsLabel(f: LayoutFixture): string {
  const { contentLen, withMeta, state } = f.dims;
  return `${contentLen}${withMeta ? " · meta" : ""} · ${state}`;
}

/** One fixture: its id + dims, then one fixed-width column per swept width. */
function FixtureRow({ fixture }: { fixture: LayoutFixture }): ReactElement {
  return (
    <Stack gap="sm">
      <Stack direction="row" gap="sm" align="baseline" wrap>
        <Text variant="label">{fixture.id}</Text>
        <Text variant="caption" tone="muted">
          {dimsLabel(fixture)}
        </Text>
      </Stack>
      <Scroll axis="x">
        <Stack direction="row" gap="lg" align="start">
          {fixture.widths.map((width) => (
            <Stack key={width} gap="2xs">
              <Text variant="caption" tone="muted">
                {width}px
              </Text>
              {/* Fixed-px width is legitimate sizing — the harness sweeps container widths. */}
              <Card style={{ width }}>{fixture.render()}</Card>
            </Stack>
          ))}
        </Stack>
      </Scroll>
    </Stack>
  );
}

/**
 * Live "Layout Lab" gallery — the human-eyeball complement to the geometry gate.
 * Loads the fixture catalog once (no polling), groups by primitive, and renders
 * each fixture across its swept container widths. No measurement here.
 */
export function Gallery(): ReactElement {
  const [fixtures, setFixtures] = useState<LayoutFixture[] | null>(null);

  useEffect(() => {
    let alive = true;
    void loadFixtures().then((loaded) => {
      if (alive) setFixtures(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (fixtures === null) {
    return (
      <Inset pad="lg">
        <Loading label="Loading fixtures…" />
      </Inset>
    );
  }

  const groups = groupByPrimitive(fixtures);

  return (
    <Scroll fill>
      <Inset pad="lg">
        <Stack gap="2xl">
          {groups.length === 0 ? (
            <Text variant="body" tone="muted">
              No layout fixtures contributed yet.
            </Text>
          ) : (
            groups.map(([primitive, group]) => (
              <Stack key={primitive} gap="lg">
                <SectionLabel>{primitive}</SectionLabel>
                <Stack gap="xl">
                  {group.map((fixture) => (
                    <FixtureRow key={fixture.id} fixture={fixture} />
                  ))}
                </Stack>
              </Stack>
            ))
          )}
        </Stack>
      </Inset>
    </Scroll>
  );
}
