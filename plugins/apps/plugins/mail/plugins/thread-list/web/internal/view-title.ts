import {
  MAIL_SYSTEM_VIEWS,
  mailViewLabelId,
} from "@plugins/apps/plugins/mail/plugins/mail-core/core";

// The pane-chrome title for a mailbox view. A system view shows its title; a
// user-label view shows the label id (the friendly label name lives in the
// sidebar, which owns the labels resource — thread-list must not import mailbox,
// so it can't resolve the name here). Unknown → "Mail".
export function mailViewTitle(view: string): string {
  const system = MAIL_SYSTEM_VIEWS.find((v) => v.id === view);
  if (system) return system.title;
  return mailViewLabelId(view) ?? "Mail";
}
