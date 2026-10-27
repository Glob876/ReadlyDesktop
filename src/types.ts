import type { TextFont } from "./fonts";

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
  fontFamily: TextFont;
  lineHeight: number;
}
export interface Poem { title: string; author: string; text: string }
export interface Plan {
  mode: "standard" | "recall" | "exam" | "difficult";
  stanzas: number[];
  blockSize: number;
}
export interface LibraryEntry extends Poem {
  id: string;
  favorite: boolean;
  position: number;
  total: number;
  started: boolean;
  completedAt: number | null;
  dueAt: number | null;
}
export interface Task {
  kind: "line" | "stanza" | "previous" | "cumulative" | "exam";
  stanza: number;
  line: number | null;
  recall: boolean;
  text: string;
}
export interface Statistics {
  attempts: number;
  correct: number;
  hints: number;
  sessions: number;
  history: {at: number; correct: boolean; poemTitle: string}[];
  difficult: {stanza: number; line: number | null; errors: number; hints: number}[];
}
export interface State {
  poem: Poem;
  settings: Settings;
  position: number;
  started: boolean;
  tasks: Task[];
  stanzas: string[][];
  activeId: string;
  library: LibraryEntry[];
  draftAnswer: string;
  hintLevel: number;
  plan: Plan;
  stats: Statistics;
  backups: {name: string; modifiedAt: number}[];
  recovery: string | null;
}
export interface Difference {kind: "missing" | "extra" | "replace"; expected: string; actual: string}
export interface Result {
  state: State;
  correct?: boolean;
  message?: string;
  differences?: Difference[];
  snapshot?: unknown;
}
export type Command =
  | {op: "load" | "hint" | "exportLibrary" | "resetRecovery"}
  | {op: "start" | "restart"; plan?: Plan}
  | {op: "savePoem"; poem: Poem}
  | {op: "settings"; settings: Settings}
  | {op: "submit" | "draft"; answer: string}
  | {op: "selectPoem"; poemId: string}
  | {op: "favorite"; poemId: string; value: boolean}
  | {op: "importLibrary"; poems?: Poem[]; snapshot?: unknown}
  | {op: "restoreBackup"; name: string};
declare global {
  interface Window {
    readly: {
      request(command: Command): Promise<Result>;
      reconnect(): Promise<Result>;
      importText(): Promise<Poem | null>;
      exportLibrary(): Promise<boolean>;
      importLibrary(): Promise<Result | null>;
      window(action: "minimize" | "maximize" | "close"): void;
      onWindowExpanded(callback: (expanded: boolean) => void): () => void;
      desktop: boolean;
    };
  }
}
