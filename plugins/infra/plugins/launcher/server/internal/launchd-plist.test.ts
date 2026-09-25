import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import { renderLaunchAgentPlist } from "./launchd-plist";

const job = {
  label: "dev.singularity.gateway",
  argv: ["/repo/gateway/gateway", "-listen", ":9000", "-child-env", "A,B_*"],
  cwd: "/repo/gateway",
  env: { PATH: "/shims:/usr/bin", HOME: "/h/me", Q: `a&b<c>"d"` },
  stdioLog: "/h/me/logs/gateway-stdio.log",
};

describe("renderLaunchAgentPlist", () => {
  const xml = renderLaunchAgentPlist(job);

  test("carries the argv in order, the cwd and the stdio log", () => {
    const strings = [...xml.matchAll(/<string>([^<]*)<\/string>/g)].map(
      (m) => m[1],
    );
    // strings[0] is the Label; the argv follows it.
    expect(strings.slice(1, 1 + job.argv.length)).toEqual(job.argv);
    expect(xml).toContain(
      "<key>WorkingDirectory</key>\n\t<string>/repo/gateway</string>",
    );
    expect(xml).toContain(
      `<key>StandardErrorPath</key>\n\t<string>${job.stdioLog}</string>`,
    );
  });

  test("escapes XML in values", () => {
    expect(xml).toContain("<string>a&amp;b&lt;c&gt;&quot;d&quot;</string>");
  });

  test("starts at load and relaunches only on an unsuccessful exit", () => {
    expect(xml).toContain("<key>RunAtLoad</key>\n\t<true/>");
    expect(xml).toMatch(
      /<key>KeepAlive<\/key>\s*<dict>\s*<key>SuccessfulExit<\/key>\s*<false\/>/,
    );
  });

  test.skipIf(process.platform !== "darwin")("plutil accepts it", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "plist-")), "job.plist");
    writeFileSync(path, xml);
    const res = await spawnCaptured(["plutil", "-lint", path], {
      timeoutMs: 10_000,
    });
    expect(res.exitCode).toBe(0);
  });
});
