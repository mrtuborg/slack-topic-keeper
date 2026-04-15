import type { Vault } from "obsidian";
import { yesterday, dateRange } from "../util/date";

export class BackfillDetector {
  constructor(
    private readonly vault: Vault,
    private readonly archiveFolder: string,
  ) {}

  async getMissingDates(backfillDays: number): Promise<string[]> {
    if (backfillDays <= 0) return [];

    const yd = yesterday();

    // Compute start of range: yesterday - (backfillDays - 1) days
    // (avoids calling today() and eliminates any sub-millisecond clock skew)
    const fromDate = new Date(`${yd}T00:00:00Z`);
    fromDate.setUTCDate(fromDate.getUTCDate() - (backfillDays - 1));
    const y = fromDate.getUTCFullYear();
    const mo = String(fromDate.getUTCMonth() + 1).padStart(2, "0");
    const d = String(fromDate.getUTCDate()).padStart(2, "0");
    const from = `${y}-${mo}-${d}`;

    if (yd < from) return [];

    const dates = dateRange(from, yd);
    const missing: string[] = [];

    for (const date of dates) {
      const mentionsPath = `${this.archiveFolder}/${date}/mentions.md`;
      const myMsgsPath = `${this.archiveFolder}/${date}/my_messages.md`;

      const mentionsExists = await this.vault.adapter.exists(mentionsPath);
      const myMsgsExists = await this.vault.adapter.exists(myMsgsPath);

      if (!mentionsExists || !myMsgsExists) {
        missing.push(date);
      }
    }

    // dateRange is already ascending; sort defensively
    return missing.sort();
  }
}

