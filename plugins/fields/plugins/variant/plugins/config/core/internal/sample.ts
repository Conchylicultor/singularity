import { fieldSample } from "@plugins/config_v2/plugins/fields/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { variantField, type VariantEntry } from "./variant";

const NOTIFICATION_CHANNELS = new Map<string, VariantEntry>([
  [
    "webhook",
    { label: "Webhook", fields: { url: textField({ label: "URL" }) } },
  ],
  [
    "email",
    { label: "Email", fields: { address: textField({ label: "Address" }) } },
  ],
]);

// A fixed registry handed to the field as its `useVariants` hook: it calls no
// React hook, so it is safe in core, and every render sees the same map.
function useNotificationChannels(): Map<string, VariantEntry> {
  return NOTIFICATION_CHANNELS;
}

/** The variant field's fixed gallery sample (see `FieldSample`). */
export const variantSample = fieldSample(
  variantField({
    label: "Notification channel",
    description: "Where finished-task alerts are sent.",
    useVariants: useNotificationChannels,
  }),
  { type: "webhook", url: "https://hooks.example.com/notify" },
);
