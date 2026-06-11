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
    cfg.config, ts.sys, dirname(job.tsconfigPath), undefined, job.tsconfigPath,
  );

  // 2. Build ONE incremental program; gather diagnostics through the builder so
  //    its state (and the persisted .tsbuildinfo) reflects what was checked.
  const builder = ts.createIncrementalProgram({
    rootNames: parsed.fileNames,
    options: {
      ...parsed.options,
      noEmit: true,
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
  ];
  // Persist the .tsbuildinfo (noEmit still writes it via the builder's emit).
  builder.emit(undefined, undefined, undefined, undefined, undefined);
  const tscErrors = diags.map((d) => formatTscDiagnostic(job.root, d)).join("\n");

  // 3. Type-aware lint, reusing the program just built (no second construction).
  let lintViolations = "";
  const failedLintFiles: string[] = [];
  if (job.lintFiles.length > 0) {
    const program = builder.getProgram();
    const config = await buildLintConfig({ root: job.root, typeSource: { programs: [program] } });
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
        lines.push(`${rel(job.root, file)}:${m.line}:${m.column}  ${m.ruleId ?? "(parse)"}  ${m.message}`);
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
