import { describe, expect, it } from "vitest";
import { escapeMarkdown, sanitizeChannelName } from "./markdown";

describe("markdown utilities", () => {
  describe("escapeMarkdown()", () => {
    it("T-MD-1: escapes brackets and backticks", () => {
      const input = "Check [this](url) and `code`";
      const result = escapeMarkdown(input);
      expect(result).toBe("Check \\[this\\](url) and \\`code\\`");
      expect(result).not.toMatch(/(?<!\\)\[/);
      expect(result).not.toMatch(/(?<!\\)\]/);
      expect(result).not.toMatch(/(?<!\\)`/);
    });

    it("escapes pipe characters", () => {
      expect(escapeMarkdown("a | b")).toBe("a \\| b");
    });

    it("escapes angle brackets", () => {
      expect(escapeMarkdown("<mention>")).toBe("\\<mention\\>");
    });

    it("leaves plain text unchanged", () => {
      expect(escapeMarkdown("hello world")).toBe("hello world");
    });
  });

  describe("sanitizeChannelName()", () => {
    it("T-MD-2: strips slashes and double-dots", () => {
      const result = sanitizeChannelName("my/bad\\channel..name");
      expect(result).not.toContain("/");
      expect(result).not.toContain("\\");
      expect(result).not.toContain("..");
    });

    it("leaves safe names unchanged", () => {
      expect(sanitizeChannelName("general")).toBe("general");
    });

    it("removes forward slash", () => {
      expect(sanitizeChannelName("a/b")).toBe("ab");
    });

    it("removes backslash", () => {
      expect(sanitizeChannelName("a\\b")).toBe("ab");
    });
  });
});
