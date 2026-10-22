import catalog from "./data/classics.json";
import type { Poem } from "./types";

export interface LibraryPoem extends Poem {
  id: string;
  year: string;
  source: string;
  sourceTitle: string;
}
export const classics: readonly LibraryPoem[] = catalog;
export const authors = [...new Set(classics.map((poem) => poem.author))];
const normalize = (value: string) => value.normalize("NFC").toLocaleLowerCase("ru").replace(/ё/g, "е");
const index = classics.map((poem) => ({
  poem,
  text: normalize(`${poem.author} ${poem.title} ${poem.text}`),
}));
export function searchClassics(query: string, author = ""): LibraryPoem[] {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return index.filter((entry) => (!author || entry.poem.author === author) &&
    words.every((word) => entry.text.includes(word))).map((entry) => entry.poem);
}
