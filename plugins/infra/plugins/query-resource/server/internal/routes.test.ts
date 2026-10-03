import { describe, expect, test } from "bun:test";
import type {
  HostMap,
  TupleUse,
} from "@plugins/framework/plugins/resource-runtime/core";
import {
  compiledRoutePlan,
  compiledUnionRoutePlan,
  unionRouteId,
  type RawRoute,
} from "./routes";

// A single compile's routes name RAW host ids (T10: an encoded identity or
// alias cannot be spelled); a union re-keys every arm's routes into its
// `kind:raw` key space at once — identity / alias encode, a reverse probe
// decodes `within` and encodes its answer — so no route can read or answer
// the wrong key space.

const usesOf = () => new Map<string, TupleUse>();

/** A reverse route whose probe records what it was asked and answers `answer`. */
function probe(answer: readonly string[] | "over-cap"): {
  route: RawRoute;
  calls: { changed: readonly string[]; within: ReadonlySet<string> | null }[];
} {
  const calls: {
    changed: readonly string[];
    within: ReadonlySet<string> | null;
  }[] = [];
  return {
    calls,
    route: {
      id: "server",
      table: "deploy_servers",
      map: {
        kind: "reverse",
        resolve: (changed, within) => {
          calls.push({ changed, within });
          return Promise.resolve(answer);
        },
      },
      columns: ["id", "name"],
    },
  };
}

const identity = (table: string): RawRoute => ({
  id: "base",
  table,
  map: { kind: "identity" },
  columns: ["id", "started_at"],
});

type ReverseMap = Extract<HostMap, { kind: "reverse" }>;
const reverseOf = (map: HostMap): ReverseMap => {
  if (map.kind !== "reverse") throw new Error(`not a reverse map: ${map.kind}`);
  return map;
};

describe("compiledRoutePlan", () => {
  test("mints raw routes as they are", () => {
    const plan = compiledRoutePlan(
      [identity("events"), probe([]).route],
      usesOf,
    );
    expect(plan.routes.map((r) => r.id)).toEqual(["base", "server"]);
    expect(plan.routes[0]!.map).toEqual({ kind: "identity" });
  });

  test("an encoded identity is not a raw route (T10)", () => {
    const encoded = {
      id: "base",
      table: "events",
      map: { kind: "identity", encode: (v: string) => `event:${v}` },
      columns: ["id"],
    } as const;
    // @ts-expect-error — a single compile cannot spell an encoded route.
    compiledRoutePlan([encoded], usesOf);
  });
});

describe("compiledUnionRoutePlan", () => {
  test("prefixes route ids: the base is `<kind>`, any other `<kind>.<id>`", () => {
    const plan = compiledUnionRoutePlan(
      [
        { kind: "build", routes: [identity("build_runs")] },
        { kind: "deploy", routes: [identity("deploy_runs"), probe([]).route] },
      ],
      usesOf,
    );
    expect(plan.routes.map((r) => r.id)).toEqual([
      "build",
      "deploy",
      "deploy.server",
    ]);
    expect(unionRouteId("deploy", "server")).toBe("deploy.server");
    expect(unionRouteId("deploy", "base")).toBe("deploy");
  });

  test("identity and alias maps encode into the arm's key space", () => {
    const plan = compiledUnionRoutePlan(
      [
        {
          kind: "build",
          routes: [
            identity("build_runs"),
            {
              id: "ext",
              table: "build_runs_ext_x",
              map: { kind: "alias", column: "run_id" },
              columns: ["run_id"],
            },
          ],
        },
      ],
      usesOf,
    );
    const [base, ext] = plan.routes;
    if (base!.map.kind !== "identity" || ext!.map.kind !== "alias") {
      throw new Error("maps changed kind");
    }
    expect(base!.map.column).toBeUndefined();
    expect(base!.map.encode!("a:b")).toBe("build:a:b");
    expect(ext!.map.column).toBe("run_id");
    expect(ext!.map.encode!("7")).toBe("build:7");
  });

  test("a reverse probe reads `within` as this arm's raw ids and answers encoded keys", async () => {
    const p = probe(["s:1", "s:2"]);
    const plan = compiledUnionRoutePlan(
      [{ kind: "deploy", routes: [identity("deploy_runs"), p.route] }],
      usesOf,
    );
    const map = reverseOf(plan.routes[1]!.map);
    const within = new Set(["deploy:s:1", "build:9", "deploy:s:2", "garbage"]);
    expect(await map.resolve(["srv-1"], within, 500)).toEqual([
      "deploy:s:1",
      "deploy:s:2",
    ]);
    expect(p.calls).toHaveLength(1);
    expect([...p.calls[0]!.within!]).toEqual(["s:1", "s:2"]);
    expect(p.calls[0]!.changed).toEqual(["srv-1"]);
  });

  test("a `within` holding none of this arm's keys skips the probe", async () => {
    const p = probe(["x"]);
    const plan = compiledUnionRoutePlan(
      [{ kind: "deploy", routes: [identity("deploy_runs"), p.route] }],
      usesOf,
    );
    const map = reverseOf(plan.routes[1]!.map);
    expect(await map.resolve(["srv-1"], new Set(["build:1"]), 500)).toEqual([]);
    expect(await map.resolve(["srv-1"], new Set(), 500)).toEqual([]);
    expect(p.calls).toHaveLength(0);
  });

  test("an unbounded reader (`within: null`) passes through; over-cap passes through", async () => {
    const unbounded = probe(["1"]);
    const capped = probe("over-cap");
    const plan = compiledUnionRoutePlan(
      [
        { kind: "deploy", routes: [identity("deploy_runs"), unbounded.route] },
        {
          kind: "release",
          routes: [identity("release_runs"), { ...capped.route, id: "srv" }],
        },
      ],
      usesOf,
    );
    const deploy = reverseOf(plan.routes[1]!.map);
    expect(await deploy.resolve(["srv-1"], null, 500)).toEqual(["deploy:1"]);
    expect(unbounded.calls[0]!.within).toBeNull();
    const release = reverseOf(plan.routes[3]!.map);
    expect(await release.resolve(["srv-1"], null, 500)).toBe("over-cap");
  });

  test("a full route is the same in every key space", () => {
    const full: RawRoute = {
      id: "agg",
      table: "t",
      map: { kind: "full", reason: "aggregate" },
      columns: ["x"],
    };
    const plan = compiledUnionRoutePlan(
      [{ kind: "build", routes: [identity("build_runs"), full] }],
      usesOf,
    );
    expect(plan.routes[1]!.map).toEqual({ kind: "full", reason: "aggregate" });
  });

  test("throws on a duplicate kind, a duplicate route id, a bad kind, and an identity on a column (A14)", () => {
    expect(() =>
      compiledUnionRoutePlan(
        [
          { kind: "build", routes: [identity("a")] },
          { kind: "build", routes: [identity("b")] },
        ],
        usesOf,
      ),
    ).toThrow(/two arms of kind "build"/);
    expect(() =>
      compiledUnionRoutePlan(
        [
          {
            kind: "deploy",
            routes: [identity("a"), probe([]).route, probe([]).route],
          },
        ],
        usesOf,
      ),
    ).toThrow(/route id "deploy.server" is minted twice/);
    expect(() =>
      compiledUnionRoutePlan(
        [{ kind: "a.b", routes: [identity("a")] }],
        usesOf,
      ),
    ).toThrow(/plain identifier/);
    expect(() =>
      compiledUnionRoutePlan(
        [
          {
            kind: "build",
            routes: [
              { ...identity("a"), map: { kind: "identity", column: "uid" } },
            ],
          },
        ],
        usesOf,
      ),
    ).toThrow(/identity route "base" reads "uid"/);
  });
});
