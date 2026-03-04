import * as http from "http";
import { EventEmitter } from "events";
import type {
  GameState,
  PanelSession,
  SessionSummary,
  WebSocketMessage,
} from "./types";

const BASE_URL = "http://localhost:8000";
const RECONNECT_DELAYS = [3000, 6000, 12000, 30000];

interface WebSocketLike {
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  close(): void;
  readyState: number;
}

function createWebSocket(url: string): WebSocketLike {
  // Use ws library (Node.js)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const WebSocket = require("ws") as typeof import("ws");
  return new WebSocket(url) as unknown as WebSocketLike;
}

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      })
      .on("error", reject);
  });
}

function gameStateToPanel(
  sessionId: string,
  projectName: string,
  state: GameState
): PanelSession {
  return {
    sessionId,
    projectName,
    boss: {
      state: state.boss.state,
      bubble: state.boss.bubble,
      currentTask: state.boss.currentTask,
    },
    agents: state.agents.map((a) => ({
      id: a.id,
      name: a.name,
      color: a.color,
      state: a.state,
      bubble: a.bubble,
      currentTask: a.currentTask,
    })),
  };
}

export class BackendClient extends EventEmitter {
  private sockets = new Map<
    string,
    { ws: WebSocketLike; retryCount: number; timer?: ReturnType<typeof setTimeout> }
  >();
  private sessionNames = new Map<string, string>();
  private disposed = false;

  /** Fetch active sessions and connect WebSockets */
  async start(): Promise<void> {
    try {
      const data = await httpGet(`${BASE_URL}/api/v1/sessions`);
      const sessions: SessionSummary[] = JSON.parse(data);
      for (const s of sessions) {
        if (s.status !== "ended") {
          this.sessionNames.set(s.id, s.projectName ?? s.id.slice(0, 8));
          this.connectSession(s.id);
        }
      }
      this.emit("connected", true);
    } catch {
      this.emit("connected", false);
      // Retry after delay
      if (!this.disposed) {
        setTimeout(() => this.start(), 5000);
      }
    }
  }

  private connectSession(sessionId: string): void {
    if (this.disposed || this.sockets.has(sessionId)) return;

    const ws = createWebSocket(`ws://localhost:8000/ws/${sessionId}`);
    const entry = { ws, retryCount: 0, timer: undefined as ReturnType<typeof setTimeout> | undefined };
    this.sockets.set(sessionId, entry);

    ws.onopen = () => {
      entry.retryCount = 0;
      this.emit("connected", true);
    };

    ws.onmessage = (ev: { data: string }) => {
      try {
        const msg: WebSocketMessage = JSON.parse(
          typeof ev.data === "string" ? ev.data : String(ev.data)
        );
        this.handleMessage(sessionId, msg);
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      this.sockets.delete(sessionId);
      if (!this.disposed) {
        const delay =
          RECONNECT_DELAYS[
            Math.min(entry.retryCount, RECONNECT_DELAYS.length - 1)
          ];
        entry.retryCount++;
        entry.timer = setTimeout(() => this.connectSession(sessionId), delay);
      }
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }

  private handleMessage(sessionId: string, msg: WebSocketMessage): void {
    switch (msg.type) {
      case "state_update": {
        if (!msg.state) break;
        const name = this.sessionNames.get(sessionId) ?? sessionId.slice(0, 8);
        const panel = gameStateToPanel(sessionId, name, msg.state);
        this.emit("sessionUpdate", panel);

        // If we see new agents, check for new sessions we haven't seen
        if (msg.state.agents.length > 0) {
          this.pollNewSessions();
        }
        break;
      }
      case "session_deleted": {
        const deletedId = msg.session_id ?? sessionId;
        this.emit("sessionRemoved", deletedId);
        const entry = this.sockets.get(deletedId);
        if (entry) {
          entry.ws.close();
          if (entry.timer) clearTimeout(entry.timer);
          this.sockets.delete(deletedId);
        }
        this.sessionNames.delete(deletedId);
        break;
      }
      case "reload": {
        // Backend cleared — remove all sessions and re-poll
        for (const [id, entry] of this.sockets) {
          entry.ws.close();
          if (entry.timer) clearTimeout(entry.timer);
          this.emit("sessionRemoved", id);
        }
        this.sockets.clear();
        this.sessionNames.clear();
        setTimeout(() => this.start(), 1000);
        break;
      }
    }
  }

  private pollTimer?: ReturnType<typeof setTimeout>;

  private pollNewSessions(): void {
    if (this.pollTimer || this.disposed) return;
    this.pollTimer = setTimeout(async () => {
      this.pollTimer = undefined;
      try {
        const data = await httpGet(`${BASE_URL}/api/v1/sessions`);
        const sessions: SessionSummary[] = JSON.parse(data);
        for (const s of sessions) {
          if (s.status !== "ended" && !this.sockets.has(s.id)) {
            this.sessionNames.set(s.id, s.projectName ?? s.id.slice(0, 8));
            this.connectSession(s.id);
          }
        }
      } catch {
        // ignore
      }
    }, 2000);
  }

  dispose(): void {
    this.disposed = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    for (const [, entry] of this.sockets) {
      entry.ws.close();
      if (entry.timer) clearTimeout(entry.timer);
    }
    this.sockets.clear();
    this.sessionNames.clear();
    this.removeAllListeners();
  }
}
