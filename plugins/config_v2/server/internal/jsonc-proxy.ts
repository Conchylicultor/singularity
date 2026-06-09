import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import { stringifyConfigValue } from "../../core";
import type { ConfigProxy } from "../../core";
import type { JsonValue } from "../../core";

const HASH_RE = /^\/\/ @hash ([a-f0-9]+)\n/;

export function jsoncConfigProxy(filePath: string): ConfigProxy {
  return {
    read() {
      if (!existsSync(filePath)) return null;
      const raw = readFileSync(filePath, "utf-8");
      const match = HASH_RE.exec(raw);
      // Every config file on disk must record the origin hash it was written
      // against (`// @hash` on line 1). The canonical writers (setConfig,
      // propagate) always emit it; a file without one is corrupt (truncated
      // write, bad hand-edit), not a benign "untracked" override. Fail loudly
      // rather than silently resolving it as a no-conflict override.
      if (!match) {
        throw new Error(
          `Config file is missing its "// @hash" header: ${filePath}. ` +
            `A hashless config file is corrupt — restore the header or delete the file.`,
        );
      }
      const hash = match[1]!;
      const body = raw.slice(match[0].length);
      const content = parseJsonc(body) as JsonValue;
      return { content, hash };
    },
    write(content: JsonValue, hash: string | null) {
      let str = "";
      if (hash !== null) str += `// @hash ${hash}\n`;
      str += stringifyConfigValue(content) + "\n";
      const tmp = `${filePath}.tmp-${randomUUID()}`;
      try {
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(tmp, str, "utf-8");
        renameSync(tmp, filePath);
      } catch (err) {
        try {
          unlinkSync(tmp);
        } catch (unlinkErr: unknown) {
          if ((unlinkErr as NodeJS.ErrnoException).code !== "ENOENT")
            throw unlinkErr;
        }
        throw err;
      }
    },
    exists() {
      return existsSync(filePath);
    },
  };
}
