import { describe, expect, test } from "bun:test";
import { createContext } from "../context";
import type { Verdict } from "../types";
import { rgReplaceGuard } from "./rg-replace";

function verdict(command: string): Verdict {
  // The guard's check is synchronous (no bypass token), so the result is a Verdict.
  return rgReplaceGuard.check({ command }, createContext("/tmp")) as Verdict;
}

const blocks = (command: string) => verdict(command).kind === "deny";

describe("rg-replace guard", () => {
  describe("the exact commands from the report", () => {
    test("the one that slipped through is now blocked", () => {
      expect(blocks(`rg -rn "skip-checks|skipChecks" --glob '*.md' .`)).toBe(true);
    });

    test("the one that was correctly blocked stays blocked", () => {
      expect(
        blocks(
          `rg -rn --glob '*.ts' -e 'skip-checks' -e 'skipChecks' plugins cli gateway web 2>/dev/null | rg -v 'commands/build.ts'`,
        ),
      ).toBe(true);
    });
  });

  describe("bundling permutations all engage --replace", () => {
    for (const flag of ["-rn", "-nr", "-rln", "-lnr", "-lrn", "-r"]) {
      test(`rg ${flag} is blocked`, () => {
        expect(blocks(`rg ${flag} pattern src`)).toBe(true);
      });
    }
  });

  describe("value-taking short flags whose value ends in 'r' are NOT a replace", () => {
    // The trailing `r` here is the VALUE of the preceding flag, not -r.
    test("-er — search pattern 'r' via -e", () => {
      expect(blocks(`rg -er src`)).toBe(false);
    });
    test("-tr — file type 'r' via -t", () => {
      expect(blocks(`rg -tr foo src`)).toBe(false);
    });
    test("-gr — glob 'r' via -g", () => {
      expect(blocks(`rg -gr foo src`)).toBe(false);
    });
    test("-Ar — context 'r' via -A", () => {
      expect(blocks(`rg -Ar foo src`)).toBe(false);
    });
  });

  describe("benign invocations stay allowed", () => {
    test("explicit long form --replace is intentional", () => {
      expect(blocks(`rg --replace X foo src`)).toBe(false);
    });
    test("plain -n", () => {
      expect(blocks(`rg -n foo src`)).toBe(false);
    });
    test("plain -l", () => {
      expect(blocks(`rg -l foo src`)).toBe(false);
    });
    test("no flags", () => {
      expect(blocks(`rg foo src`)).toBe(false);
    });
    test("a different binary", () => {
      expect(blocks(`grep -rn foo src`)).toBe(false);
    });
  });

  describe("scans every call in the command, not just the first", () => {
    test("pipeline — offending rg is downstream", () => {
      expect(blocks(`cat file | rg -rn foo`)).toBe(true);
    });

    test("sequence — benign rg first, offending rg second", () => {
      expect(blocks(`rg -n foo src; rg -rn bar lib`)).toBe(true);
    });

    test("multi-line script — offending rg on line 2", () => {
      expect(blocks(`rg -n foo src\nrg -rn bar lib`)).toBe(true);
    });

    test("multi-line script — all lines benign", () => {
      expect(blocks(`rg -n foo src\nrg -l bar lib`)).toBe(false);
    });
  });
});
