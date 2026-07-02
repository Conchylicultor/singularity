import type { MailAddress } from "@plugins/apps/plugins/mail/plugins/mail-core/core";

/** Display name for one address — its `name` when present, else the email. */
export function addressLabel(addr: MailAddress): string {
  return addr.name && addr.name.trim().length > 0 ? addr.name : addr.email;
}

/** A comma-joined recipient list, e.g. "Ada, grace@example.com". Empty → "". */
export function recipientsLabel(addrs: MailAddress[]): string {
  return addrs.map(addressLabel).join(", ");
}
