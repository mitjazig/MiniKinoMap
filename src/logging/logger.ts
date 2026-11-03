export type LogCategory =
  | 'app'
  | 'workout'
  | 'treadmill'
  | 'bluetooth'
  | 'heartRate'
  | 'video'
  | 'cast'
  | 'youtube'
  | 'storage';

export type LogLevel = 'info' | 'warn' | 'error';

export type DevLogEntry = {
  id: number;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
};

const MAX_ENTRIES = 240;

export class DeveloperLogger {
  private entries: DevLogEntry[] = [];
  private nextId = 1;
  private listeners = new Set<(entries: DevLogEntry[]) => void>();

  info(category: LogCategory, message: string) {
    this.write('info', category, message);
  }

  warn(category: LogCategory, message: string) {
    this.write('warn', category, message);
  }

  error(category: LogCategory, message: string) {
    this.write('error', category, message);
  }

  write(level: LogLevel, category: LogCategory, message: string) {
    const entry: DevLogEntry = {
      id: this.nextId,
      timestamp: Date.now(),
      level,
      category,
      message,
    };
    this.nextId += 1;
    const next = [...this.entries, entry];
    this.entries = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    for (const listener of this.listeners) listener(this.entries);
  }

  subscribe(listener: (entries: DevLogEntry[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.entries);
    return () => this.listeners.delete(listener);
  }

  getEntries(): DevLogEntry[] {
    return this.entries;
  }

  clear() {
    this.entries = [];
    for (const listener of this.listeners) listener(this.entries);
  }
}

const holder = globalThis as { __runscapeLogger?: DeveloperLogger };
if (!holder.__runscapeLogger) holder.__runscapeLogger = new DeveloperLogger();

export const logger = holder.__runscapeLogger;
