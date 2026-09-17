/**
 * Where the IP-to-country data comes from. DB-IP Lite is licensed CC BY 4.0,
 * so any surface showing a looked-up country credits it from this constant —
 * the credit and the data source live in one place.
 */
export const IP_COUNTRY_SOURCE = {
  name: "DB-IP",
  url: "https://db-ip.com",
  license: "CC BY 4.0",
} as const;
