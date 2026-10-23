import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { Command, Result } from "../src/types";
import { validateCommand } from "./files";

/** A timed-out write may already have reached disk. Never retry it automatically. */
export class CoreConnection {
  private child?: ChildProcessWithoutNullStreams;
  private stopped?: Promise<void>;
  private serial = 0;
  private failure = "";
  private restarting = false;
  private pending = new Map<number, {
    resolve: (value: Result) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }>();

  constructor(private binary: string, private args: string[], private timeout = 15_000, private importTimeout = 120_000) {
    this.start();
  }

  private rejectAll(message: string) {
    this.failure = message;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }

  private start() {
    this.failure = "";
    const child = spawn(this.binary, this.args, { stdio: "pipe", windowsHide: true });
    this.child = child;
    this.stopped = new Promise<void>((resolve) => child.once("close", () => resolve()));
    let diagnostics = "";
    const fail = (message: string) => {
      if (this.child === child) this.rejectAll(message);
    };
    child.stderr.on("data", (data) => { diagnostics = (diagnostics + String(data)).slice(-4000); });
    child.on("error", (error) => fail("Не удалось запустить ядро: " + error.message));
    child.on("exit", () => fail(diagnostics || "Ядро завершило работу. Восстановите соединение."));
    child.stdin.on("error", () => fail("Нет связи с ядром. Восстановите соединение."));
    createInterface({ input: child.stdout }).on("line", (line) => {
      if (this.child !== child) return;
      try {
        const response = JSON.parse(line);
        const pending = this.pending.get(response.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(response.id);
        if (typeof response.error === "string") pending.reject(new Error(response.error));
        else if (response.result && typeof response.result === "object") pending.resolve(response.result);
        else { pending.reject(new Error("Некорректный ответ ядра.")); fail("Некорректный ответ ядра. Восстановите соединение."); }
      } catch {
        fail("Некорректный ответ ядра. Восстановите соединение.");
      }
    });
  }

  request(command: Command): Promise<Result> {
    if (this.restarting) return Promise.reject(new Error("Соединение восстанавливается."));
    if (this.failure) return Promise.reject(new Error(this.failure));
    try { validateCommand(command); } catch (error) { return Promise.reject(error); }
    return new Promise((resolve, reject) => {
      const id = ++this.serial;
      const timer = setTimeout(() => {
        const action = command.op === "importLibrary" ? "Импорт библиотеки не завершился за две минуты. " : "";
        this.rejectAll(action + "Превышено время ожидания ядра. Восстановите соединение перед продолжением; последнее действие могло сохраниться.");
      }, command.op === "importLibrary" ? this.importTimeout : this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.child!.stdin.write(JSON.stringify({ ...command, id }) + "\n", (error) => {
        if (error) this.rejectAll("Нет связи с ядром: " + error.message);
      });
    });
  }

  async reconnect(): Promise<Result> {
    if (this.restarting) throw new Error("Соединение уже восстанавливается.");
    this.restarting = true;
    this.rejectAll("Соединение восстанавливается.");
    const old = this.child;
    const stopped = this.stopped;
    try {
      if (old && old.exitCode === null && old.signalCode === null) {
        // Wait until the old writer is gone before opening the same profile again.
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Не удалось остановить ядро.")), 5000);
          void stopped!.then(() => { clearTimeout(timer); resolve(); });
          old.kill();
        });
      }
      this.start();
    } finally {
      this.restarting = false;
    }
    return this.request({ op: "load" });
  }

  close() {
    this.rejectAll("Приложение закрывается.");
    this.child?.kill();
  }
}
