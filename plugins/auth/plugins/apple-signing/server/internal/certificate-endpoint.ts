import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { setConfig } from "@plugins/config_v2/server";
import { setAppleCertificateEndpoint } from "../../core/endpoints";
import { appleSigningConfig } from "../../shared/config";

/**
 * Extract the leaf-cert PEM from a `.p12`. macOS ships LibreSSL (rejects
 * `-legacy`); Homebrew OpenSSL 3 needs `-legacy` for modern PKCS#12. Returns
 * null when this attempt fails (wrong password, or the wrong legacy mode).
 */
async function pkcs12ToCertPem(
  p12Path: string,
  password: string,
  legacy: boolean,
): Promise<string | null> {
  const args = [
    "pkcs12",
    "-in",
    p12Path,
    "-passin",
    `pass:${password}`,
    "-nokeys",
    "-clcerts",
  ];
  if (legacy) args.push("-legacy");
  const proc = Bun.spawn(["openssl", ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  if (proc.exitCode !== 0) return null;
  return stdout;
}

/** Read the certificate subject line via `openssl x509 -noout -subject`. */
async function certSubject(certPem: string): Promise<string | null> {
  const proc = Bun.spawn(["openssl", "x509", "-noout", "-subject"], {
    stdin: new TextEncoder().encode(certPem),
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  if (proc.exitCode !== 0) return null;
  return stdout.trim();
}

/**
 * Parse the CN from an openssl subject line. Tolerates the OpenSSL 3
 * `subject=CN = X`, the older `subject= /CN=X`, and bare `CN=X` forms. The CN
 * value runs up to the next RDN separator (comma / slash / newline).
 */
function parseCn(subject: string): string | null {
  const match = subject.match(/CN\s*=\s*([^,/\n]+)/);
  if (!match) return null;
  const cn = match[1]!.trim();
  return cn.length > 0 ? cn : null;
}

async function deriveSigningIdentity(
  p12Path: string,
  password: string,
): Promise<{ opened: boolean; signingIdentity: string | null }> {
  // Try modern (LibreSSL / OpenSSL default) first, then legacy (OpenSSL 3).
  let certPem = await pkcs12ToCertPem(p12Path, password, false);
  if (certPem === null) certPem = await pkcs12ToCertPem(p12Path, password, true);
  if (certPem === null) return { opened: false, signingIdentity: null };

  const subject = await certSubject(certPem);
  return { opened: true, signingIdentity: subject ? parseCn(subject) : null };
}

export const handleSetAppleCertificate = implement(
  setAppleCertificateEndpoint,
  async ({ body }) => {
    const tmpDir = mkdtempSync(join(tmpdir(), "apple-cert-"));
    try {
      const p12Path = join(tmpDir, "cert.p12");
      writeFileSync(p12Path, Buffer.from(body.p12Base64, "base64"), {
        mode: 0o600,
      });

      const { opened, signingIdentity } = await deriveSigningIdentity(
        p12Path,
        body.password,
      );

      // Could not open the .p12 either way → wrong password / unreadable.
      if (!opened) {
        throw new HttpError(
          400,
          "Could not open certificate — check the password",
        );
      }

      // Persist through the same config path the setConfigField handler uses:
      // secret fields hit the encrypted store (and notify the secret-meta
      // resource); the text field lands in config_v2 JSONC.
      await setConfig(appleSigningConfig, "p12Cert", body.p12Base64);
      await setConfig(appleSigningConfig, "p12Password", body.password);
      if (signingIdentity) {
        await setConfig(appleSigningConfig, "signingIdentity", signingIdentity);
      }

      return { signingIdentity };
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  },
);
