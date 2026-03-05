import type { PanelSession } from "./types";

export type StateListener = () => void;

class Store {
  private sessions = new Map<string, PanelSession>();
  private listeners: StateListener[] = [];
  private _connected = false;

  get connected(): boolean {
    return this._connected;
  }

  setConnected(value: boolean): void {
    this._connected = value;
    this.notify();
  }

  updateSession(session: PanelSession): void {
    this.sessions.set(session.sessionId, session);
    this.notify();
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.notify();
  }

  getSessions(): PanelSession[] {
    return Array.from(this.sessions.values());
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  getTotalAgentCount(): number {
    let count = 0;
    for (const s of this.sessions.values()) {
      count += s.agents.length;
    }
    return count;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const l of this.listeners) {
      l();
    }
  }
}

export const store = new Store();
