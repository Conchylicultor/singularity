import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./paths";
import { toolchainPin } from "./toolchain-pin";

const saved = process.env.SINGULARITY_RELEASE;
afterEach(() => {
  if (saved === undefined) delete process.env.SINGULARITY_RELEASE;
  else process.env.SINGULARITY_RELEASE = saved;
});

describe("toolchainPin", () => {
  test("points mise's global config at this checkout's mise.toml", () => {
    delete process.env.SINGULARITY_RELEASE;
    const pin = toolchainPin();
    expect(pin).toEqual({
      MISE_GLOBAL_CONFIG_FILE: join(REPO_ROOT, "mise.toml"),
    });
    expect(existsSync(pin.MISE_GLOBAL_CONFIG_FILE!)).toBe(true);
  });

  test("pins nothing in a release, which has no checkout", () => {
    process.env.SINGULARITY_RELEASE = "1";
    expect(toolchainPin()).toEqual({});
  });
});
