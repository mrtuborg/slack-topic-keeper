/** Escapes Markdown special characters: | [ ] ` < > */
export function escapeMarkdown(text: string): string {
  return text.replace(/[|\[\]`<>]/g, "\\$&");
}

/**
 * Strips path-traversal characters (/  \  ..) from a channel name.
 * Prevents archive folder path injection.
 */
export function sanitizeChannelName(name: string): string {
  return name
    .replace(/\.\./g, "")
    .replace(/[/\\]/g, "");
}
