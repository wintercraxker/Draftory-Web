export type SearchablePlayer = {
  name: string;
  username: string;
  country: string;
};
export const classificationSearchConfig = {
  debounceMs: 200,
  maxSuggestions: 8,
};

const normalize = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export function matchesClassification(player: SearchablePlayer, query: string) {
  const term = normalize(query.trim().replace(/^@/, ""));
  return (
    !term ||
    [player.name, player.username, player.country].some((value) =>
      normalize(value).includes(term),
    )
  );
}

// Map normalized offsets back to the original text, including accented names.
export function classificationMatch(
  text: string,
  query: string,
): { start: number; end: number } | null {
  const term = normalize(query.trim().replace(/^@/, ""));
  if (!term) return null;
  let folded = "",
    offset = 0;
  const offsets: { start: number; end: number }[] = [];
  for (const character of text) {
    const value = normalize(character);
    folded += value;
    for (let i = 0; i < value.length; i++)
      offsets.push({ start: offset, end: offset + character.length });
    offset += character.length;
  }
  const index = folded.indexOf(term);
  return index < 0
    ? null
    : {
        start: offsets[index].start,
        end: offsets[index + term.length - 1].end,
      };
}
