export interface Settings {
  caseSensitive: boolean;
  punctuation: boolean;
  distinguishYo: boolean;
  strictWhitespace: boolean;
  lineBreaks: boolean;
  theme: "light" | "dark" | "sepia" | "system";
  accent: "green" | "blue" | "purple" | "rose" | "orange" | "slate";
  opacity: number;
  fontSize: number;
}
export interface Poem {
  title: string;
  author: string;
  text: string;
}
export interface Task {
  kind: "line" | "stanza" | "previous" | "cumulative";
  stanza: number;
  line: number | null;
  recall: boolean;
  text: string;
}
export interface State {
  poem: Poem;
  settings: Settings;
  position: number;
  started: boolean;
  tasks: Task[];
  stanzas: string[][];
}
export interface Result {
  state: State;
  correct?: boolean;
  message?: string;
  expected?: string;
}
export type Command =
  | { op: "load" | "start" | "restart" }
  | { op: "savePoem"; poem: Poem }
  | { op: "settings"; settings: Settings }
  | { op: "submit"; answer: string };
declare global {
  interface Window {
    readly: {
      request(command: Command): Promise<Result>;
      window(action: "minimize" | "maximize" | "close"): void;
      desktop: boolean;
    };
  }
}
