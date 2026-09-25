/**
 * The Postgres release (`major.minor`) an npm version names, or null when the
 * version does not start with one.
 *
 * `@equin/pg-client-*@18.3.0` and `@embedded-postgres/*@18.3.0-beta.17` both
 * name Postgres 18.3 — the embedded package's pre-release tag is ITS build
 * counter, not Postgres's.
 */
export function pgRelease(npmVersion: string): string | null {
  const m = /^(\d+)\.(\d+)\./.exec(npmVersion);
  return m ? `${m[1]}.${m[2]}` : null;
}

export type PackagePins = {
  /** The package.json this came from, for the message. */
  file: string;
  /** Package name → pinned version, as written in optionalDependencies. */
  pins: Record<string, string>;
};

/**
 * Every problem with the two pin sets, empty when they agree: each file pins
 * its four platform packages to ONE version, and both versions name the same
 * Postgres release.
 */
export function versionMismatches(
  client: PackagePins,
  server: PackagePins,
): string[] {
  const problems: string[] = [];
  const single = (p: PackagePins): string | null => {
    const versions = [...new Set(Object.values(p.pins))];
    if (versions.length === 1) return versions[0]!;
    problems.push(
      versions.length === 0
        ? `${p.file} pins no platform packages`
        : `${p.file} pins its platform packages to different versions: ${JSON.stringify(p.pins)}`,
    );
    return null;
  };
  const clientVersion = single(client);
  const serverVersion = single(server);
  if (clientVersion === null || serverVersion === null) return problems;

  const clientRelease = pgRelease(clientVersion);
  const serverRelease = pgRelease(serverVersion);
  if (clientRelease === null || serverRelease === null) {
    problems.push(
      `cannot read a Postgres major.minor from ${clientVersion} / ${serverVersion}`,
    );
  } else if (clientRelease !== serverRelease) {
    problems.push(
      `client tools are Postgres ${clientRelease} (${client.file}: ${clientVersion}) ` +
        `but the embedded server is Postgres ${serverRelease} (${server.file}: ${serverVersion})`,
    );
  }
  return problems;
}
