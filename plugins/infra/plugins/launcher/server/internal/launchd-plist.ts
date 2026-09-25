/**
 * Render a launchd property list for a per-user LaunchAgent — pure, so the exact
 * job the OS will run is unit-testable without launchd.
 *
 * The policy is fixed here rather than taken as options, because it is the
 * policy of the one job this exists for (the gateway):
 * - `RunAtLoad` — start when loaded, i.e. at login and on `launchctl bootstrap`.
 * - `KeepAlive.SuccessfulExit = false` — relaunch after a crash or a non-zero
 *   exit; a clean stop (exit 0 on SIGTERM) stays stopped.
 * - `ThrottleInterval` 10s — the gateway exits 1 when Postgres cannot start, and
 *   that must retry, not hot-loop.
 * - `ExitTimeOut` 20s — the gateway's own shutdown budget is 15s; SIGKILL after
 *   it, not the launchd default, which could cut a backend teardown short.
 */
export function renderLaunchAgentPlist(job: {
  label: string;
  argv: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
  /** stdout and stderr both land here (launchd appends). */
  stdioLog: string;
}): string {
  const str = (v: string) => `<string>${escapeXml(v)}</string>`;
  const envEntries = Object.keys(job.env)
    .sort()
    .map((k) => `\t\t<key>${escapeXml(k)}</key>\n\t\t${str(job.env[k]!)}`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t${str(job.label)}
\t<key>ProgramArguments</key>
\t<array>
${job.argv.map((a) => `\t\t${str(a)}`).join("\n")}
\t</array>
\t<key>WorkingDirectory</key>
\t${str(job.cwd)}
\t<key>EnvironmentVariables</key>
\t<dict>
${envEntries}
\t</dict>
\t<key>RunAtLoad</key>
\t<true/>
\t<key>KeepAlive</key>
\t<dict>
\t\t<key>SuccessfulExit</key>
\t\t<false/>
\t</dict>
\t<key>ThrottleInterval</key>
\t<integer>10</integer>
\t<key>ExitTimeOut</key>
\t<integer>20</integer>
\t<key>StandardOutPath</key>
\t${str(job.stdioLog)}
\t<key>StandardErrorPath</key>
\t${str(job.stdioLog)}
</dict>
</plist>
`;
}

function escapeXml(v: string): string {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
