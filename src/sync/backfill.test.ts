import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Vault } from "obsidian";
import { BackfillDetector } from "./backfill";

// Today fixed to 2026-04-15 for all tests
const FIXED_NOW = new Date("2026-04-15T10:00:00Z");

function makeMockVault(existingPaths: string[] = []) {
  const paths = new Set<string>(existingPaths);
  return {
    adapter: {
      exists: vi.fn(async (path: string) => paths.has(path)),
    },
  };
}

describe("BackfillDetector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  it("T-BACKFILL-1: all 3 days present — returns []", async () => {
    const vault = makeMockVault([
      "slack/2026-04-12/mentions.md",
      "slack/2026-04-12/my_messages.md",
      "slack/2026-04-13/mentions.md",
      "slack/2026-04-13/my_messages.md",
      "slack/2026-04-14/mentions.md",
      "slack/2026-04-14/my_messages.md",
    ]);
    const detector = new BackfillDetector(vault as unknown as Vault, "slack");

    const missing = await detector.getMissingDates(3);

    expect(missing).toEqual([]);
  });

  // -------------------------------------------------------------------------
  it("T-BACKFILL-2: 04-13 missing — returns [\"2026-04-13\"]", async () => {
    const vault = makeMockVault([
      "slack/2026-04-12/mentions.md",
      "slack/2026-04-12/my_messages.md",
      // 04-13 absent
      "slack/2026-04-14/mentions.md",
      "slack/2026-04-14/my_messages.md",
    ]);
    const detector = new BackfillDetector(vault as unknown as Vault, "slack");

    const missing = await detector.getMissingDates(3);

    expect(missing).toEqual(["2026-04-13"]);
  });

  // -------------------------------------------------------------------------
  it("T-BACKFILL-3: no files — returns all 3 days; today not included", async () => {
    const vault = makeMockVault(); // no files
    const detector = new BackfillDetector(vault as unknown as Vault, "slack");

    const missing = await detector.getMissingDates(3);

    expect(missing).toEqual(["2026-04-12", "2026-04-13", "2026-04-14"]);
    expect(missing).not.toContain("2026-04-15");
  });

  // -------------------------------------------------------------------------
  it("T-BACKFILL-4: 04-13 has only mentions.md — returns [\"2026-04-13\"]", async () => {
    const vault = makeMockVault([
      "slack/2026-04-12/mentions.md",
      "slack/2026-04-12/my_messages.md",
      "slack/2026-04-13/mentions.md",
      // my_messages.md absent for 04-13
      "slack/2026-04-14/mentions.md",
      "slack/2026-04-14/my_messages.md",
    ]);
    const detector = new BackfillDetector(vault as unknown as Vault, "slack");

    const missing = await detector.getMissingDates(3);

    expect(missing).toEqual(["2026-04-13"]);
  });

  // -------------------------------------------------------------------------
  it("T-BACKFILL-5: backfillDays=2 — only returns 2-day window even if earlier dates miss", async () => {
    // 04-10 through 04-12 are missing but outside the 2-day window
    const vault = makeMockVault(); // no files at all
    const detector = new BackfillDetector(vault as unknown as Vault, "slack");

    const missing = await detector.getMissingDates(2);

    expect(missing).toEqual(["2026-04-13", "2026-04-14"]);
    expect(missing).not.toContain("2026-04-12");
    expect(missing).not.toContain("2026-04-11");
    expect(missing).not.toContain("2026-04-10");
  });

  // -------------------------------------------------------------------------
  it("T-BACKFILL-6: multiple missing — sorted ascending", async () => {
    // 04-12 and 04-14 present; 04-13 absent
    const vault = makeMockVault([
      "slack/2026-04-12/mentions.md",
      "slack/2026-04-12/my_messages.md",
      "slack/2026-04-14/mentions.md",
      "slack/2026-04-14/my_messages.md",
    ]);
    const detector = new BackfillDetector(vault as unknown as Vault, "slack");

    const missing = await detector.getMissingDates(3);

    expect(missing).toEqual(["2026-04-13"]);
    // All three missing with backfillDays=4 (adds 04-11)
    const vault2 = makeMockVault([
      "slack/2026-04-12/mentions.md",
      "slack/2026-04-12/my_messages.md",
    ]);
    const detector2 = new BackfillDetector(vault2 as unknown as Vault, "slack");
    const missing2 = await detector2.getMissingDates(4);
    expect(missing2).toEqual(["2026-04-11", "2026-04-13", "2026-04-14"]);
  });

  // -------------------------------------------------------------------------
  it("T-BACKFILL-7: backfillDays=1 — returns only [\"2026-04-14\"]; today not present", async () => {
    const vault = makeMockVault(); // no folders
    const detector = new BackfillDetector(vault as unknown as Vault, "slack");

    const missing = await detector.getMissingDates(1);

    expect(missing).toEqual(["2026-04-14"]);
    expect(missing).not.toContain("2026-04-15");
  });

  // -------------------------------------------------------------------------
  it("returns [] immediately when backfillDays is 0 without querying vault", async () => {
    const vault = makeMockVault(); // no files
    const detector = new BackfillDetector(vault as unknown as Vault, "slack");

    const missing = await detector.getMissingDates(0);

    expect(missing).toEqual([]);
    expect(vault.adapter.exists).not.toHaveBeenCalled();
  });
});
