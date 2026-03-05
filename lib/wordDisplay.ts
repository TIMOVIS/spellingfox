/**
 * Format a word for display in the UI: lowercase unless it looks like a proper noun
 * (first letter capital, rest lowercase), in which case keep that form.
 */
export function formatWordForDisplay(word: string): string {
  if (!word || word.length === 0) return word;
  const trimmed = word.trim();
  if (trimmed.length === 0) return word;
  const first = trimmed[0];
  const rest = trimmed.slice(1);
  if (trimmed.length > 1 && first === first.toUpperCase() && rest === rest.toLowerCase()) {
    return trimmed;
  }
  return trimmed.toLowerCase();
}
