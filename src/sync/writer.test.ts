import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Vault } from "obsidian";
import { MarkdownWriter } from "./writer";
import type { ChannelMessages } from "./writer";

// ---------------------------------------------------------------------------
// Minimal in-memory mock vault
// ---------------------------------------------------------------------------
function makeMockVault() {
  const files = new Map<string, string>();
  const folders = new Set<string>();
  return {
    adapter: {
      exists: vi.fn(async (path: string) => files.has(path) || folders.has(path)),
      read: vi.fn(async (path: string) => files.get(path) ?? ""),
    },
    createFolder: vi.fn(async (path: string) => {
      folders.add(path);
    }),
    create: vi.fn(async (path: string, content: string) => {
      files.set(path, content);
    }),
    getAbstractFileByPath: vi.fn((path: string) => files.has(path) ? { path } : null),
    modify: vi.fn(async (file: { path: string }, content: string) => {
      files.set(file.path, content);
    }),
    _files: files,
    _folders: folders,
  };
}

type MockVault = ReturnType<typeof makeMockVault>;

function makeWriter(vault: MockVault, folder = "slack") {
  return new MarkdownWriter(vault as unknown as Vault, folder);
}

// Helpers
function makeChannel(
  name: string,
  isDM: boolean,
  messages: ChannelMessages["messages"],
): ChannelMessages {
  return { channelName: name, isDM, messages };
}

const FETCHED_AT = "2026-04-15T10:00:00.000Z";
const DATE = "2026-04-14";

describe("MarkdownWriter", () => {
  let vault: MockVault;
  let writer: MarkdownWriter;

  beforeEach(() => {
    vault = makeMockVault();
    writer = makeWriter(vault);
  });

  // -------------------------------------------------------------------------
  it("T-WRITER-1: creates mentions.md with frontmatter, H1, H2, bullets, dedup comment", async () => {
    const channels: ChannelMessages[] = [
      makeChannel("general", false, [
        { time: "10:00 AM", author: "alice", text: "hello", dedupKey: "C01/100.0" },
      ]),
    ];

    await writer.write(DATE, "mentions", channels, FETCHED_AT);

    const content = vault._files.get(`slack/${DATE}/mentions.md`)!;
    expect(content).toContain("---");
    expect(content).toContain(`date: ${DATE}`);
    expect(content).toContain("type: slack-mentions");
    expect(content).toContain(`fetched_at: ${FETCHED_AT}`);
    expect(content).toContain(`# Slack Mentions — ${DATE}`);
    expect(content).toContain("## #general");
    expect(content).toContain("- **10:00 AM** — @alice: hello");
    expect(content).toContain("<!-- slack-keys: C01/100.0 -->");
  });

  // -------------------------------------------------------------------------
  it("T-WRITER-2: creates my_messages.md with type: slack-my-messages", async () => {
    const channels: ChannelMessages[] = [
      makeChannel("dev", false, [
        { time: "09:00 AM", text: "a message", dedupKey: "C02/200.0" },
      ]),
    ];

    await writer.write(DATE, "my_messages", channels, FETCHED_AT);

    const content = vault._files.get(`slack/${DATE}/my_messages.md`)!;
    expect(content).toContain("type: slack-my-messages");
    expect(content).toContain(`# My Slack Messages — ${DATE}`);
    expect(content).toContain("- **09:00 AM** — a message");
  });

  // -------------------------------------------------------------------------
  it("T-WRITER-5: messages within a channel appear in provided order", async () => {
    const channels: ChannelMessages[] = [
      makeChannel("general", false, [
        { time: "08:00 AM", text: "first",  dedupKey: "C01/800.0" },
        { time: "09:00 AM", text: "second", dedupKey: "C01/900.0" },
        { time: "10:00 AM", text: "third",  dedupKey: "C01/1000.0" },
      ]),
    ];

    await writer.write(DATE, "mentions", channels, FETCHED_AT);

    const content = vault._files.get(`slack/${DATE}/mentions.md`)!;
    const firstPos  = content.indexOf("first");
    const secondPos = content.indexOf("second");
    const thirdPos  = content.indexOf("third");
    expect(firstPos).toBeLessThan(secondPos);
    expect(secondPos).toBeLessThan(thirdPos);
  });

  // -------------------------------------------------------------------------
  it("T-WRITER-6: messages from 3 channels each get their own H2", async () => {
    const channels: ChannelMessages[] = [
      makeChannel("general", false, [{ time: "10:00 AM", text: "msg1", dedupKey: "C01/1.0" }]),
      makeChannel("dev",     false, [{ time: "10:01 AM", text: "msg2", dedupKey: "C02/2.0" }]),
      makeChannel("random",  false, [{ time: "10:02 AM", text: "msg3", dedupKey: "C03/3.0" }]),
    ];

    await writer.write(DATE, "mentions", channels, FETCHED_AT);

    const content = vault._files.get(`slack/${DATE}/mentions.md`)!;
    expect(content).toContain("## #general");
    expect(content).toContain("## #dev");
    expect(content).toContain("## #random");
  });

  // -------------------------------------------------------------------------
  it("T-WRITER-7: public channel heading is ## #<name>", async () => {
    await writer.write(DATE, "mentions", [
      makeChannel("general", false, [{ time: "10:00 AM", text: "hi", dedupKey: "C01/1.0" }]),
    ], FETCHED_AT);

    const content = vault._files.get(`slack/${DATE}/mentions.md`)!;
    expect(content).toContain("## #general");
  });

  // -------------------------------------------------------------------------
  it("T-WRITER-8: DM channel heading is ## DM with @<name>", async () => {
    await writer.write(DATE, "mentions", [
      makeChannel("Bob", true, [{ time: "10:00 AM", author: "Bob", text: "hey", dedupKey: "D01/1.0" }]),
    ], FETCHED_AT);

    const content = vault._files.get(`slack/${DATE}/mentions.md`)!;
    expect(content).toContain("## DM with @Bob");
  });

  // -------------------------------------------------------------------------
  it("T-WRITER-9: dedup comment lists all keys joined by comma", async () => {
    const channels: ChannelMessages[] = [
      makeChannel("general", false, [
        { time: "10:00 AM", text: "a", dedupKey: "C01/111.0" },
        { time: "10:01 AM", text: "b", dedupKey: "C01/222.0" },
      ]),
    ];

    await writer.write(DATE, "mentions", channels, FETCHED_AT);

    const content = vault._files.get(`slack/${DATE}/mentions.md`)!;
    expect(content).toContain("<!-- slack-keys: C01/111.0,C01/222.0 -->");
  });

  // -------------------------------------------------------------------------
  it("T-WRITER-10: frontmatter contains date, type, and ISO 8601 fetched_at", async () => {
    await writer.write(DATE, "mentions", [], FETCHED_AT);

    const content = vault._files.get(`slack/${DATE}/mentions.md`)!;
    expect(content).toContain(`date: ${DATE}`);
    expect(content).toContain("type: slack-mentions");
    expect(content).toContain(`fetched_at: ${FETCHED_AT}`);
    // fetched_at value looks like ISO 8601
    expect(FETCHED_AT).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  // -------------------------------------------------------------------------
  it("T-WRITER-11: special characters in message text are escaped in output", async () => {
    const channels: ChannelMessages[] = [
      makeChannel("general", false, [
        {
          time: "10:00 AM",
          text: "see \\[link\\] and \\`code\\`",  // pre-escaped by engine
          dedupKey: "C01/1.0",
        },
      ]),
    ];

    await writer.write(DATE, "mentions", channels, FETCHED_AT);

    const content = vault._files.get(`slack/${DATE}/mentions.md`)!;
    expect(content).toContain("\\[link\\]");
    expect(content).toContain("\\`code\\`");
  });

  // -------------------------------------------------------------------------
  it("T-WRITER-12: creates folder before writing when it does not exist", async () => {
    // folder does not exist initially — vault._folders is empty
    expect(vault._folders.size).toBe(0);

    await writer.write(DATE, "mentions", [], FETCHED_AT);

    expect(vault.createFolder).toHaveBeenCalledWith(`slack/${DATE}`);
    expect(vault._files.has(`slack/${DATE}/mentions.md`)).toBe(true);
  });

  // -------------------------------------------------------------------------
  it("skips writing if file already exists", async () => {
    // Write once
    await writer.write(DATE, "mentions", [], FETCHED_AT);
    const firstCallCount = (vault.create as ReturnType<typeof vi.fn>).mock.calls.length;

    // Write again — should be skipped
    await writer.write(DATE, "mentions", [], FETCHED_AT);
    const secondCallCount = (vault.create as ReturnType<typeof vi.fn>).mock.calls.length;

    expect(secondCallCount).toBe(firstCallCount);
  });

  // -------------------------------------------------------------------------
  it("T-WRITER-3: writeOrMerge merges 1 new message into existing file with 2", async () => {
    const channels2: ChannelMessages[] = [
      makeChannel("general", false, [
        { time: "10:00 AM", author: "alice", text: "first", dedupKey: "C01/100.0" },
        { time: "10:01 AM", author: "alice", text: "second", dedupKey: "C01/200.0" },
      ]),
    ];
    // Create initial file with 2 messages
    await writer.write(DATE, "mentions", channels2, FETCHED_AT);

    const channels3: ChannelMessages[] = [
      makeChannel("general", false, [
        { time: "10:00 AM", author: "alice", text: "first", dedupKey: "C01/100.0" },
        { time: "10:01 AM", author: "alice", text: "second", dedupKey: "C01/200.0" },
        { time: "10:02 AM", author: "bob", text: "brand new", dedupKey: "C01/300.0" },
      ]),
    ];
    const count = await writer.writeOrMerge(DATE, "mentions", channels3, "2026-04-15T11:00:00.000Z");

    expect(count).toBe(1);
    const content = vault._files.get(`slack/${DATE}/mentions.md`)!;
    expect(content).toContain("first");
    expect(content).toContain("second");
    expect(content).toContain("brand new");
    expect(content).toContain("C01/100.0,C01/200.0,C01/300.0");
  });

  // -------------------------------------------------------------------------
  it("T-WRITER-4: writeOrMerge with no new messages returns 0, leaves file unchanged", async () => {
    const channels: ChannelMessages[] = [
      makeChannel("general", false, [
        { time: "10:00 AM", author: "alice", text: "first", dedupKey: "C01/100.0" },
        { time: "10:01 AM", author: "alice", text: "second", dedupKey: "C01/200.0" },
      ]),
    ];
    await writer.write(DATE, "mentions", channels, FETCHED_AT);
    const originalContent = vault._files.get(`slack/${DATE}/mentions.md`)!;

    const count = await writer.writeOrMerge(DATE, "mentions", channels, "2026-04-15T11:00:00.000Z");

    expect(count).toBe(0);
    // File should not have been modified (fetched_at is unchanged)
    const content = vault._files.get(`slack/${DATE}/mentions.md`)!;
    expect(content).toBe(originalContent);
  });
});
