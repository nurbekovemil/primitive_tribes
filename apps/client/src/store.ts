import { useSyncExternalStore } from 'react';
import type { BuildingKind, LogTone } from '@game/shared';

export interface LogEntry {
  id: number;
  text: string;
  tone: LogTone | 'chat' | 'system';
  name?: string;
  color?: string;
}

export interface HoverHint {
  x: number;
  y: number;
  text: string;
}

export interface UIState {
  /** Выделенные id: люди или одна постройка/костёр. */
  selection: string[];
  placing: BuildingKind | null;
  hint: HoverHint | null;
  logs: LogEntry[];
  /** Счётчик для перерисовки панелей по таймеру. */
  frame: number;
}

type Listener = () => void;

class Store {
  private state: UIState = { selection: [], placing: null, hint: null, logs: [], frame: 0 };
  private listeners = new Set<Listener>();
  private logSeq = 0;

  get = () => this.state;

  set(patch: Partial<UIState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  addLog(entry: Omit<LogEntry, 'id'>) {
    const logs = [...this.state.logs, { ...entry, id: ++this.logSeq }].slice(-80);
    this.set({ logs });
  }
}

export const store = new Store();

export function useStore<T>(selector: (s: UIState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}
