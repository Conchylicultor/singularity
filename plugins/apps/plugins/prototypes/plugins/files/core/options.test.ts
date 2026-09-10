import { describe, expect, test } from "bun:test";
import {
  foldOptions,
  humanizeToken,
  parseOptionDeclaration,
  pickedValue,
  picksFromQuery,
  resolvePicks,
  type PrototypeOption,
} from "./options";
import { readOptionSource, readPrototypeOptions } from "./option-source";
import { prototypeUrl } from "./prototypes";

// The syntax pin for `<meta name="prototype-option">`. The gallery list, the
// folder validator and the server's stamping all go through these functions,
// so the rules live here and nowhere else.

function reasonOf(raw: string): string {
  const d = parseOptionDeclaration(raw);
  if (d.kind !== "malformed") throw new Error(`expected malformed: ${raw}`);
  return d.reason;
}

describe("parseOptionDeclaration", () => {
  test("a declaration, whitespace ignored", () => {
    expect(
      parseOptionDeclaration("  palette :violet|  indigo | azure "),
    ).toEqual({
      kind: "declared",
      name: "palette",
      values: ["violet", "indigo", "azure"],
    });
  });

  test("values may start with a digit", () => {
    expect(parseOptionDeclaration("keys: 3-octaves | 88-keys")).toEqual({
      kind: "declared",
      name: "keys",
      values: ["3-octaves", "88-keys"],
    });
  });

  test("every malformed shape says why", () => {
    expect(reasonOf("palette violet | azure")).toContain('"<name>:"');
    expect(reasonOf(": a | b")).toContain("empty");
    expect(reasonOf("Palette: a | b")).toContain("lowercase");
    expect(reasonOf("3d: a | b")).toContain("starting with a letter");
    expect(reasonOf("v: a | b")).toContain("reserved");
    expect(reasonOf("p: a || b")).toContain("empty");
    expect(reasonOf("p: a | Soft tray")).toContain('"Soft tray"');
    expect(reasonOf("p: a | b | a")).toContain('"a" is listed twice');
    expect(reasonOf("p: only")).toContain("at least two");
    expect(reasonOf("")).toContain('"<name>:"');
  });
});

describe("foldOptions", () => {
  test("the default is the <html data-*> attribute", () => {
    const { options, problems } = foldOptions({
      declarations: ["pane: flush | floating", "palette: violet | azure"],
      htmlData: { pane: "floating", palette: "violet", other: "x" },
    });
    expect(problems).toEqual([]);
    expect(options).toEqual([
      { name: "pane", values: ["flush", "floating"], default: "floating" },
      { name: "palette", values: ["violet", "azure"], default: "violet" },
    ]);
  });

  test("a broken line is dropped and reported", () => {
    const { options, problems } = foldOptions({
      declarations: [
        "pane: flush | floating",
        "pane: a | b",
        "palette: violet | azure",
        "density: cozy | compact",
        "nonsense",
      ],
      htmlData: { pane: "flush", palette: "teal" },
    });
    expect(options.map((o) => o.name)).toEqual(["pane"]);
    expect(problems).toHaveLength(4);
    expect(problems[0]).toContain("declared twice");
    expect(problems[1]).toContain('<html data-palette="teal">');
    expect(problems[2]).toContain('<html data-density="cozy">');
    expect(problems[3]).toContain("malformed");
  });
});

const PANE: PrototypeOption = {
  name: "pane",
  values: ["flush", "floating", "soft-tray"],
  default: "flush",
};
const PALETTE: PrototypeOption = {
  name: "palette",
  values: ["violet", "azure"],
  default: "violet",
};

describe("resolvePicks", () => {
  test("keeps valid non-default picks, in declaration order", () => {
    expect(
      Object.entries(
        resolvePicks([PANE, PALETTE], { palette: "azure", pane: "soft-tray" }),
      ),
    ).toEqual([
      ["pane", "soft-tray"],
      ["palette", "azure"],
    ]);
  });

  test("drops defaults, unknown options and stale values", () => {
    expect(
      resolvePicks([PANE, PALETTE], {
        pane: "flush",
        palette: "teal",
        gone: "x",
      }),
    ).toEqual({});
  });

  test("pickedValue falls back to the default", () => {
    expect(pickedValue(PANE, {})).toBe("flush");
    expect(pickedValue(PANE, { pane: "floating" })).toBe("floating");
  });
});

describe("picksFromQuery", () => {
  test("reads declared picks and ignores the cache-bust", () => {
    expect(
      picksFromQuery(
        [PANE, PALETTE],
        new URLSearchParams("v=12&palette=azure"),
      ),
    ).toEqual({ ok: true, picks: { palette: "azure" } });
  });

  test("fails on anything undeclared", () => {
    const bad = (qs: string, options = [PANE, PALETTE]) => {
      const r = picksFromQuery(options, new URLSearchParams(qs));
      if (r.ok) throw new Error(`expected failure: ${qs}`);
      return r.reason;
    };
    expect(bad("palette=teal")).toContain("violet | azure");
    expect(bad("theme=dark")).toContain("it declares: pane, palette");
    expect(bad("theme=dark", [])).toContain("it declares none");
    expect(bad("palette=azure&palette=violet")).toContain("twice");
  });

  test("round-trips through prototypeUrl", () => {
    const url = prototypeUrl("proto-1-abcd", {
      v: 7,
      picks: resolvePicks([PANE, PALETTE], {
        palette: "azure",
        pane: "soft-tray",
      }),
    });
    expect(url).toBe(
      "/api/prototypes/proto-1-abcd/index.html?v=7&pane=soft-tray&palette=azure",
    );
    expect(
      picksFromQuery([PANE, PALETTE], new URL(url, "http://x").searchParams),
    ).toEqual({ ok: true, picks: { pane: "soft-tray", palette: "azure" } });
  });

  test("an untouched prototype keeps its plain URL", () => {
    expect(prototypeUrl("p", { v: 3, picks: {} })).toBe(
      "/api/prototypes/p/index.html?v=3",
    );
    expect(prototypeUrl("p")).toBe("/api/prototypes/p/index.html");
  });
});

describe("readOptionSource", () => {
  test("reads the <html> data attributes and every option line, decoded", async () => {
    const html = `<!doctype html><html lang="en" data-pane="flush" data-palette="azure">
      <head>
        <meta name="prototype-option" content="pane: flush | floating" />
        <meta name="description" content="x" />
        <meta name="prototype-option" content="palette: violet &#124; azure" />
      </head><body></body></html>`;
    expect(await readOptionSource(html)).toEqual({
      declarations: ["pane: flush | floating", "palette: violet | azure"],
      htmlData: { pane: "flush", palette: "azure" },
    });
    expect((await readPrototypeOptions(html)).options).toEqual([
      { name: "pane", values: ["flush", "floating"], default: "flush" },
      { name: "palette", values: ["violet", "azure"], default: "azure" },
    ]);
  });

  test("a page with no options declares none", async () => {
    expect(
      await readPrototypeOptions("<html><head><title>x</title></head></html>"),
    ).toEqual({ options: [], problems: [] });
  });
});

describe("humanizeToken", () => {
  test("dashes become spaces, first letter capitalised", () => {
    expect(humanizeToken("soft-tray")).toBe("Soft tray");
    expect(humanizeToken("88-keys")).toBe("88 keys");
    expect(humanizeToken("azure")).toBe("Azure");
  });
});
