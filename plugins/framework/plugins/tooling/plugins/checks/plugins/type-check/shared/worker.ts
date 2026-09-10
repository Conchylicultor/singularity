/**
 * Per-target worker for the `type-check` check. Spawned once per tsconfig
 * target (own process, so the single-threaded TS-program build for each target
 * runs on its own core). It builds the program ONCE and drives both consumers:
 *
 *   1. `tsc` semantic diagnostics (via the incremental builder, persisting the
 *      shared `.tsbuildinfo` so warm runs re-check only the diff);
 *   2. type-aware ESLint, with the SAME program injected via `parserOptions.programs`
 *      so typescript-eslint reuses it instead of constructing a second one.
 *
 * That single construction — not the parallelism — is what removes the
 * duplicated ~99%-TS-program-build cost the two old checks each paid.
 *
 * Protocol: argv[2] is a JSON job file (so a cold run's thousands of lint paths
 * never hit the argv limit). stdout is one JSON result object. A nonzero exit
 * means the worker itself crashed (the orchestrator records no PASSes for it).
 */
import { readFileSync, unlinkSync } from "fs";
import { dirname, relative } from "path";
import ts from "typescript";
import { Linter } from "eslint";
import { buildLintConfig } from "@plugins/framework/plugins/tooling/plugins/lint/core";

interface Job {
  root: string;
  name: string;
  tsconfigPath: string;
  buildInfoPath: string;
  /** Absolute paths assigned to THIS target's program (closure-cache-filtered). */
  lintFiles: string[];
}

interface Result {
  name: string;
  tscErrors: string;
  lintViolations: string;
  /** Absolute paths whose lint produced an error-level (or fatal) message. */
  failedLintFiles: string[];
}

function rel(root: string, abs: string): string {
  return relative(root, abs).split("\\").join("/");
}

function formatTscDiagnostic(root: string, d: ts.Diagnostic): string {
  const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
  if (d.file && d.start !== undefined) {
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
    return `${rel(root, d.file.fileName)}:${line + 1}:${character + 1} - error TS${d.code}: ${msg}`;
  }
  return `error TS${d.code}: ${msg}`;
}

async function run(job: Job): Promise<Result> {
  // 1. Parse the tsconfig (glob resolution only — no type-check yet).
  const cfg = ts.readConfigFile(job.tsconfigPath, ts.sys.readFile);
  if (cfg.error) {
    return {
      name: job.name,
      tscErrors: formatTscDiagnostic(job.root, cfg.error),
      lintViolations: "",
      failedLintFiles: [],
    };
  }
  const parsed = ts.parseJsonConfigFileContent(
    cfg.config,
    ts.sys,
    dirname(job.tsconfigPath),
    undefined,
    job.tsconfigPath,
  );

  // 2. Build ONE incremental program; gather diagnostics through the builder so
  //    its state (and the persisted .tsbuildinfo) reflects what was checked.
  //
  //    Declarations are EMITTED, to a writer that keeps nothing but the
  //    buildinfo. Not for the .d.ts files — nothing reads them — but for what
  //    computing them puts INTO the buildinfo: a real per-file signature, the
  //    hash of each file's public shape. Under `noEmit` tsc stores a placeholder
  //    (signature = version) for every file, so it cannot tell a body edit from
  //    an API change and re-checks a hub's entire importer closure either way:
  //    measured on web-core, a one-line body edit in a file with a thousand
  //    importers cost 168 CPU-s and 7.8 GB, the same as cold. With real
  //    signatures the same edit costs the identical-tree floor, 38 CPU-s and
  //    2.5 GB; an edit that changes an API still re-checks its importers, as it
  //    must. `rootDir` is the repo root so every file has a well-defined output
  //    path (without it tsc reports TS6059 for anything outside the tsconfig's
  //    own directory); `outDir` is named but never written. See
  //    research/2026-09-09-global-type-check-zone-cut.md, Finding 5.
  const builder = ts.createIncrementalProgram({
    rootNames: parsed.fileNames,
    options: {
      ...parsed.options,
      noEmit: false,
      declaration: true,
      emitDeclarationOnly: true,
      rootDir: job.root,
      outDir: `${job.buildInfoPath}.decl-out`,
      incremental: true,
      tsBuildInfoFile: job.buildInfoPath,
    },
  });
  const diags: ts.Diagnostic[] = [
    ...builder.getConfigFileParsingDiagnostics(),
    ...builder.getOptionsDiagnostics(),
    ...builder.getGlobalDiagnostics(),
    ...builder.getSyntacticDiagnostics(),
    ...builder.getSemanticDiagnostics(),
    // Declaration diagnostics are their own channel: an exported value whose
    // inferred type cannot be written down (TS2883 / TS4023) is only reported
    // here, and a program that cannot emit declarations cannot have real
    // signatures — so it is a real error, fixed with an annotation.
    ...builder.getDeclarationDiagnostics(),
  ];
  // Emit through a writer that persists ONLY the .tsbuildinfo. The .d.ts text
  // is computed (that is what fills in the signatures) and dropped.
  const emitResult = builder.emit(
    undefined,
    (fileName, text, writeByteOrderMark) => {
      if (fileName.endsWith(".tsbuildinfo")) {
        ts.sys.writeFile(fileName, text, writeByteOrderMark);
      }
    },
    undefined,
    undefined,
    undefined,
  );
  diags.push(...emitResult.diagnostics);
  const tscErrors = diags
    .map((d) => formatTscDiagnostic(job.root, d))
    .join("\n");

  // 3. Type-aware lint, reusing the program just built (no second construction).
  let lintViolations = "";
  const failedLintFiles: string[] = [];
  if (job.lintFiles.length > 0) {
    const program = builder.getProgram();
    const config = await buildLintConfig({
      root: job.root,
      typeSource: { programs: [program] },
    });
    const linter = new Linter({ configType: "flat" });
    const lines: string[] = [];
    for (const file of job.lintFiles) {
      const code = ts.sys.readFile(file);
      if (code === undefined) continue;
      // `--quiet` parity: error-level (2) and fatal parse errors only.
      const messages = linter
        .verify(code, config as Linter.Config[], { filename: file })
        .filter((m) => m.severity === 2 || m.fatal);
      if (messages.length === 0) continue;
      failedLintFiles.push(file);
      for (const m of messages) {
        // A null ruleId means the message came from the linter itself, not a
        // rule — either a parse failure (fatal) or an unused-disable-directive
        // report. Label them apart: with reportUnusedDisableDirectives on, the
        // latter is common, and calling it a parse error sends the reader
        // hunting for a syntax bug that isn't there.
        const source = m.ruleId ?? (m.fatal ? "(parse)" : "(unused-disable)");
        lines.push(
          `${rel(job.root, file)}:${m.line}:${m.column}  ${source}  ${m.message}`,
        );
      }
    }
    lintViolations = lines.join("\n");
  }

  return { name: job.name, tscErrors, lintViolations, failedLintFiles };
}

const jobPath = process.argv[2];
if (!jobPath) {
  console.error("type-check worker: missing job file argument");
  process.exit(2);
}
const job = JSON.parse(readFileSync(jobPath, "utf8")) as Job;
const result = await run(job);
try {
  unlinkSync(jobPath);
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}
process.stdout.write(JSON.stringify(result));
