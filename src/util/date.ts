export function today(): string {
  return formatDate(new Date());
}

export function yesterday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return formatDate(d);
}

export function dateRange(from: string, to: string): string[] {
  const result: string[] = [];
  const current = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (current <= end) {
    result.push(formatDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return result;
}

/**
 * Converts a Slack timestamp (e.g. "1681560240.000100") to a formatted time
 * string. Supports tokens: HH (24h hour), hh (12h hour), mm (minutes),
 * A (AM/PM uppercase), a (am/pm lowercase).
 * Uses a single-pass regex replace to avoid token collisions.
 */
export function formatTimestamp(unixTs: string, format: string): string {
  const ms = parseFloat(unixTs) * 1000;
  const d = new Date(ms);
  const hours24 = d.getHours();
  const minutes = d.getMinutes();
  const hours12 = hours24 % 12 || 12;
  const isAm = hours24 < 12;
  return format.replace(/HH|hh|mm|A|a/g, (token) => {
    switch (token) {
      case "HH": return String(hours24).padStart(2, "0");
      case "hh": return String(hours12).padStart(2, "0");
      case "mm": return String(minutes).padStart(2, "0");
      case "A":  return isAm ? "AM" : "PM";
      case "a":  return isAm ? "am" : "pm";
      default:   return token;
    }
  });
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
