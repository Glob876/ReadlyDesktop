import "@fontsource/onest/cyrillic-400.css";
import "@fontsource/onest/latin-400.css";
import "@fontsource/manrope/cyrillic-400.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/inter/cyrillic-400.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/golos-text/cyrillic-400.css";
import "@fontsource/golos-text/latin-400.css";
import "@fontsource/rubik/cyrillic-400.css";
import "@fontsource/rubik/latin-400.css";

export const textFonts = [
  { id: "serif", label: "С засечками", family: 'Georgia, "Times New Roman", serif' },
  { id: "sans", label: "Без засечек", family: 'Arial, sans-serif' },
  { id: "mono", label: "Моноширинный", family: 'monospace' },
  { id: "onest", label: "Onest", family: 'Onest, sans-serif' },
  { id: "manrope", label: "Manrope", family: 'Manrope, sans-serif' },
  { id: "inter", label: "Inter", family: 'Inter, sans-serif' },
  { id: "golos-text", label: "Golos Text", family: '"Golos Text", sans-serif' },
  { id: "rubik", label: "Rubik", family: 'Rubik, sans-serif' },
] as const;

export type TextFont = typeof textFonts[number]["id"];
