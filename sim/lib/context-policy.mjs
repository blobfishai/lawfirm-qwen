/** Deterministic context compaction for long tool-use episodes. */
export const CONTEXT_POLICY = Object.freeze({
  keepRecentToolResults: 12,
  oldToolResultChars: 1000,
  pressureKeepRecentToolResults: 6,
  pressureOldToolResultChars: 300,
});

export function compactToolHistory(messages, keepRecent, oldChars) {
  const toolIndexes = messages
    .map((message, index) => message.role === "tool" ? index : null)
    .filter((index) => index !== null);
  const compact = toolIndexes.slice(0, Math.max(0, toolIndexes.length - keepRecent));
  let changed = 0;
  for (const index of compact) {
    const current = String(messages[index].content ?? "");
    if (current.length <= oldChars) continue;
    messages[index].content = `${current.slice(0, oldChars)}\n…[older tool result compacted]`;
    changed++;
  }
  return changed;
}
