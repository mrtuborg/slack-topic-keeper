import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dateRange, formatTimestamp, today } from "./date";

describe("date utilities", () => {
  describe("today()", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-15T10:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("T-DATE-1: returns current UTC date as YYYY-MM-DD", () => {
      expect(today()).toBe("2026-04-15");
    });
  });

  describe("dateRange()", () => {
    it("T-DATE-2: returns inclusive ascending array of date strings", () => {
      expect(dateRange("2026-04-13", "2026-04-15")).toEqual([
        "2026-04-13",
        "2026-04-14",
        "2026-04-15",
      ]);
    });
  });

  describe("formatTimestamp()", () => {
    it("T-DATE-3: formats Slack timestamp with hh:mm A pattern", () => {
      const result = formatTimestamp("1681560240.000100", "hh:mm A");
      // Must match 12h time format like "10:30 AM"
      expect(result).toMatch(/^\d{2}:\d{2} (AM|PM)$/);
    });

    it("formats with HH:mm pattern (24-hour)", () => {
      // 1681560240 seconds — verify it produces a valid 24h time
      const result = formatTimestamp("1681560240.000100", "HH:mm");
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });

    it("formats AM correctly for a morning timestamp (local time)", () => {
      // Pick a timestamp and derive the expected local-time string dynamically.
      const ts = "1744704000.000000";
      const d = new Date(parseFloat(ts) * 1000);
      const h = d.getHours() % 12 || 12;
      const m = d.getMinutes();
      const ampm = d.getHours() < 12 ? "AM" : "PM";
      const expected = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
      expect(formatTimestamp(ts, "hh:mm A")).toBe(expected);
    });

    it("formats PM correctly for an afternoon timestamp (local time)", () => {
      const ts = "1744727400.000000";
      const d = new Date(parseFloat(ts) * 1000);
      const h = d.getHours() % 12 || 12;
      const m = d.getMinutes();
      const ampm = d.getHours() < 12 ? "AM" : "PM";
      const expected = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
      expect(formatTimestamp(ts, "hh:mm A")).toBe(expected);
    });
  });
});
