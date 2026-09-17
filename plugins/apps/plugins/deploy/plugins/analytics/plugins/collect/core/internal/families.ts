import { z } from "zod";

/**
 * The closed family lists a user agent is reduced to on the server. The full
 * user-agent string is never stored — only one member of each list.
 */
export const DEVICE_FAMILIES = ["Desktop", "Mobile", "Tablet"] as const;
export const DeviceFamilySchema = z.enum(DEVICE_FAMILIES);
export type DeviceFamily = z.infer<typeof DeviceFamilySchema>;

export const BROWSER_FAMILIES = [
  "Chrome",
  "Safari",
  "Firefox",
  "Edge",
  "Opera",
  "Samsung Internet",
  "Other",
] as const;
export const BrowserFamilySchema = z.enum(BROWSER_FAMILIES);
export type BrowserFamily = z.infer<typeof BrowserFamilySchema>;

export const OS_FAMILIES = [
  "Windows",
  "macOS",
  "iOS",
  "Android",
  "Linux",
  "ChromeOS",
  "Other",
] as const;
export const OsFamilySchema = z.enum(OS_FAMILIES);
export type OsFamily = z.infer<typeof OsFamilySchema>;
