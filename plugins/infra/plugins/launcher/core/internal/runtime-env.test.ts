import { describe, expect, test } from "bun:test";
import {
  RUNTIME_FORWARDED_ENV,
  RUNTIME_FORWARDED_PREFIXES,
  RUNTIME_FORWARDED_TOOL_ENV,
  RUNTIME_HOST_ENV,
  RUNTIME_WITHHELD_ENV,
  pickHostEnv,
  pickRuntimeEnv,
  runtimeEnvNames,
} from "./runtime-env";

const forwarded = Object.keys(RUNTIME_FORWARDED_ENV);
const withheld = Object.keys(RUNTIME_WITHHELD_ENV);
const prefixes = Object.keys(RUNTIME_FORWARDED_PREFIXES);

describe("pickRuntimeEnv", () => {
  test("keeps host, forwarded, tool and prefix-matched names", () => {
    const picked = pickRuntimeEnv({
      HOME: "home-value",
      PATH: "/usr/bin",
      SINGULARITY_DIR: "/data",
      SINGULARITY_RELEASE_RUN_ID: "run-1",
      PLAYWRIGHT_BROWSERS_PATH: "",
      SINGULARITY_AUTH_GOOGLE_CLIENT_ID: "id",
    });
    expect(picked).toEqual({
      HOME: "home-value",
      PATH: "/usr/bin",
      SINGULARITY_DIR: "/data",
      SINGULARITY_RELEASE_RUN_ID: "run-1",
      PLAYWRIGHT_BROWSERS_PATH: "",
      SINGULARITY_AUTH_GOOGLE_CLIENT_ID: "id",
    });
  });

  test("drops withheld names — the leak this exists to stop", () => {
    const picked = pickRuntimeEnv({
      HOME: "home-value",
      SINGULARITY_CONVERSATION_ID: "conv-1",
      SINGULARITY_PARENT_HOST: "http://singularity.localhost:9000",
      SINGULARITY_BUILD_ID: "build-1",
      SINGULARITY_HOST_GRANT: "4",
    });
    expect(picked).toEqual({ HOME: "home-value" });
  });

  test("drops names it has never heard of", () => {
    const picked = pickRuntimeEnv({
      TMUX: "/tmp/tmux-501/default,1,0",
      TMUX_PANE: "%3",
      CLAUDECODE: "1",
      CLAUDE_CODE_SESSION_ID: "s",
      WARP_IS_LOCAL_SHELL_SESSION: "1",
      SOCKET_PATH: "/sock",
      PGHOST: "elsewhere",
      SINGULARITY_SOMETHING_NEW: "x",
      // A prefix match is a prefix of the NAME, not a substring of it.
      MY_SINGULARITY_AUTH_X: "y",
    });
    expect(picked).toEqual({});
  });

  test("skips names whose value is undefined", () => {
    expect(pickRuntimeEnv({ HOME: undefined, SINGULARITY_DIR: "/d" })).toEqual({
      SINGULARITY_DIR: "/d",
    });
  });
});

describe("pickHostEnv", () => {
  test("keeps only the host facts, dropping installation settings too", () => {
    const picked = pickHostEnv({
      HOME: "home-value",
      PATH: "/usr/bin",
      LANG: "en_US.UTF-8",
      LC_ALL: undefined,
      SINGULARITY_DIR: "/data",
      SINGULARITY_AUTH_GOOGLE_CLIENT_SECRET: "secret",
      PLAYWRIGHT_BROWSERS_PATH: "/pw",
      CLAUDECODE: "1",
      CLAUDE_CODE_EXTRA_BODY: "{}",
      SOCKET_PATH: "/sock",
      SINGULARITY_CONVERSATION_ID: "conv-1",
    });
    expect(picked).toEqual({
      HOME: "home-value",
      PATH: "/usr/bin",
      LANG: "en_US.UTF-8",
    });
  });
});

describe("the declaration", () => {
  test("forwarded and withheld are disjoint", () => {
    expect(forwarded.filter((name) => withheld.includes(name))).toEqual([]);
  });

  test("no withheld name is forwarded by a prefix", () => {
    expect(
      withheld.filter((name) => prefixes.some((p) => name.startsWith(p))),
    ).toEqual([]);
  });

  test("every forwarded, withheld and prefix key is a SINGULARITY_ name", () => {
    for (const name of [...forwarded, ...withheld, ...prefixes]) {
      expect(name).toStartWith("SINGULARITY_");
    }
  });

  test("host and tool names are not SINGULARITY_ names", () => {
    for (const name of [
      ...RUNTIME_HOST_ENV,
      ...Object.keys(RUNTIME_FORWARDED_TOOL_ENV),
    ]) {
      expect(name).not.toStartWith("SINGULARITY_");
    }
  });
});

describe("runtimeEnvNames", () => {
  test("lists every declared name, and each prefix as <prefix>*", () => {
    const names = runtimeEnvNames();
    expect(names).toContain("HOME");
    expect(names).toContain("SINGULARITY_DIR");
    expect(names).toContain("PLAYWRIGHT_BROWSERS_PATH");
    expect(names).toContain("SINGULARITY_AUTH_*");
    expect(names).not.toContain("SINGULARITY_CONVERSATION_ID");
    expect(new Set(names).size).toBe(names.length);
  });

  test("every entry is a gateway-parsable name: no comma, no =, * only as a suffix", () => {
    for (const entry of runtimeEnvNames()) {
      expect(entry).toMatch(/^[A-Za-z_][A-Za-z0-9_]*\*?$/);
    }
  });
});
