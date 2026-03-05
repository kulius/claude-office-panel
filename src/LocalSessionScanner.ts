import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { EventEmitter } from "events";
import type { PanelSession, BossState, AgentState } from "./types";

const POLL_INTERVAL = 3000;
const ACTIVE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const TAIL_CHUNK_SIZE = 8192;
const HEAD_CHUNK_SIZE = 16384;
const AGENT_COLORS = [
  "#06b6d4", "#a855f7", "#f59e0b", "#22c55e",
  "#ec4899", "#3b82f6", "#ef4444", "#14b8a6",
];

interface JsonlLine {
  readonly type?: string;
  readonly timestamp?: string;
  readonly cwd?: string;
  readonly sessionId?: string;
  readonly data?: { readonly type?: string };
  readonly message?: { readonly content?: string };
}

/** Read last N lines from file using a fixed-size tail buffer (avoids loading entire file) */
function readLastLines(filePath: string, count: number): string[] {
  try {
    const fd = fs.openSync(filePath, "r");
    const stat = fs.fstatSync(fd);
    const fileSize = stat.size;
    let position = fileSize;
    let accumulated = "";
    let lines: string[] = [];

    while (position > 0 && lines.length < count + 1) {
      const readSize = Math.min(TAIL_CHUNK_SIZE, position);
      position -= readSize;
      const buf = Buffer.alloc(readSize);
      fs.readSync(fd, buf, 0, readSize, position);
      accumulated = buf.toString("utf-8") + accumulated;
      lines = accumulated.split("\n");
    }

    fs.closeSync(fd);
    if (lines[lines.length - 1] === "") lines.pop();
    return lines.slice(-count);
  } catch {
    return [];
  }
}

/** Read first N lines from file start */
function readFirstLines(filePath: string, count: number): string[] {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(HEAD_CHUNK_SIZE);
    const bytesRead = fs.readSync(fd, buf, 0, HEAD_CHUNK_SIZE, 0);
    fs.closeSync(fd);
    const lines = buf.toString("utf-8", 0, bytesRead).split("\n");
    return lines.slice(0, count).filter(Boolean);
  } catch {
    return [];
  }
}

function parseLine(line: string): JsonlLine | undefined {
  try {
    return JSON.parse(line) as JsonlLine;
  } catch {
    return undefined;
  }
}

function parseTimestamp(ts: string): number {
  const ms = new Date(ts).getTime();
  return isNaN(ms) ? 0 : ms;
}

function inferBossState(lastLines: JsonlLine[]): BossState {
  if (lastLines.length === 0) return "idle";

  const last = lastLines[lastLines.length - 1];
  if (!last.timestamp) return "idle";

  const ts = parseTimestamp(last.timestamp);
  if (ts === 0) return "idle";
  const age = Date.now() - ts;

  if (age > 2 * 60 * 1000) return "idle";

  const recentTypes = lastLines.map((l) => l.type).filter(Boolean);
  const lastType = recentTypes[recentTypes.length - 1];

  if (age < 30_000) {
    if (lastType === "assistant") return "working";
    if (lastType === "user") return "receiving";
    if (lastType === "progress") return "working";
  }

  return "reviewing";
}

function inferAgentState(lastLines: JsonlLine[]): AgentState {
  if (lastLines.length === 0) return "waiting";

  const last = lastLines[lastLines.length - 1];
  if (!last.timestamp) return "waiting";

  const ts = parseTimestamp(last.timestamp);
  if (ts === 0) return "waiting";
  const age = Date.now() - ts;

  if (age > 2 * 60 * 1000) return "completed";
  if (age < 30_000) return "working";
  return "thinking";
}

function stableColorFromId(id: string, palette: readonly string[]): string {
  let hash = 0;
  for (let j = 0; j < id.length; j++) {
    hash = (hash * 31 + id.charCodeAt(j)) >>> 0;
  }
  return palette[hash % palette.length];
}

export class LocalSessionScanner extends EventEmitter {
  private timer?: ReturnType<typeof setInterval>;
  private disposed = false;
  private knownSessions = new Set<string>();
  private connectedEmitted = false;

  readonly claudeProjectsDir: string;

  constructor() {
    super();
    this.claudeProjectsDir = path.join(os.homedir(), ".claude", "projects");
  }

  start(): void {
    if (this.timer) return; // already running
    this.scan();
    this.timer = setInterval(() => this.scan(), POLL_INTERVAL);
  }

  private scan(): void {
    if (this.disposed) return;

    const sessions = this.findActiveSessions();
    const currentIds = new Set(sessions.map((s) => s.sessionId));

    // Emit removed sessions
    for (const id of this.knownSessions) {
      if (!currentIds.has(id)) {
        this.knownSessions.delete(id);
        this.emit("sessionRemoved", id);
      }
    }

    // Emit updates
    for (const session of sessions) {
      this.knownSessions.add(session.sessionId);
      this.emit("sessionUpdate", session);
    }

    // Mark as connected (emitted at least once)
    if (!this.connectedEmitted) {
      this.connectedEmitted = true;
    }
  }

  private findActiveSessions(): PanelSession[] {
    const sessions: PanelSession[] = [];

    let projectDirs: string[];
    try {
      projectDirs = fs.readdirSync(this.claudeProjectsDir);
    } catch {
      return [];
    }

    for (const dirName of projectDirs) {
      const dirPath = path.join(this.claudeProjectsDir, dirName);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(dirPath);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;

      // Find .jsonl files in this directory
      let files: string[];
      try {
        files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".jsonl"));
      } catch {
        continue;
      }

      // Find the most recently modified .jsonl file
      let newest: { name: string; mtime: number } | undefined;
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        try {
          const fstat = fs.statSync(filePath);
          if (!newest || fstat.mtimeMs > newest.mtime) {
            newest = { name: file, mtime: fstat.mtimeMs };
          }
        } catch {
          continue;
        }
      }

      if (!newest) continue;

      // Only consider active sessions (modified within threshold)
      if (Date.now() - newest.mtime > ACTIVE_THRESHOLD_MS) continue;

      const jsonlPath = path.join(dirPath, newest.name);
      const sessionId = newest.name.endsWith(".jsonl")
        ? newest.name.slice(0, -6)
        : newest.name;

      // Read first lines to find cwd (skip file-history-snapshot)
      let cwd: string | undefined;
      const earlyLines = readFirstLines(jsonlPath, 10);
      for (const line of earlyLines) {
        const parsed = parseLine(line);
        if (parsed?.cwd) {
          cwd = parsed.cwd;
          break;
        }
      }

      // Read last 5 lines for state inference
      const lastLines = readLastLines(jsonlPath, 5)
        .map(parseLine)
        .filter((l): l is JsonlLine => l !== undefined);

      const bossState = inferBossState(lastLines);
      const projectName = this.resolveProjectName(cwd ?? dirName);

      // Scan subagents
      const agents = this.scanSubagents(dirPath, sessionId);

      sessions.push({
        sessionId,
        projectName,
        cwd,
        boss: { state: bossState },
        agents,
      });
    }

    return sessions;
  }

  private scanSubagents(
    sessionDir: string,
    parentSessionId: string
  ): PanelSession["agents"] {
    // Structure: {projectDir}/{sessionId}/subagents/agent-*.jsonl
    const subagentDir = path.join(sessionDir, parentSessionId, "subagents");

    let files: string[];
    try {
      files = fs.readdirSync(subagentDir).filter(
        (f) => f.endsWith(".jsonl") && f.startsWith("agent-")
      );
    } catch {
      return [];
    }

    const agents: PanelSession["agents"][number][] = [];

    for (const file of files) {
      const filePath = path.join(subagentDir, file);
      const agentId = file.endsWith(".jsonl") ? file.slice(0, -6) : file;

      try {
        const stat = fs.statSync(filePath);
        if (Date.now() - stat.mtimeMs > ACTIVE_THRESHOLD_MS) continue;
      } catch {
        continue;
      }

      const lastLines = readLastLines(filePath, 5)
        .map(parseLine)
        .filter((l): l is JsonlLine => l !== undefined);

      const state = inferAgentState(lastLines);
      const color = stableColorFromId(agentId, AGENT_COLORS);
      const name = this.extractAgentName(filePath);

      agents.push({
        id: agentId,
        name,
        color,
        state,
      });
    }

    return agents;
  }

  /** Extract a meaningful name from the first user message in a subagent jsonl */
  private extractAgentName(filePath: string): string {
    const lines = readFirstLines(filePath, 3);
    for (const line of lines) {
      const parsed = parseLine(line);
      if (parsed?.type === "user" && parsed.message?.content) {
        const content = parsed.message.content;
        // Take first 20 chars, trim to last word boundary
        const snippet = content.slice(0, 20).trim();
        const lastSpace = snippet.lastIndexOf(" ");
        return lastSpace > 0 ? snippet.slice(0, lastSpace) : snippet;
      }
    }
    return "Agent";
  }

  private resolveProjectName(cwdOrDirName: string): string {
    const folders = vscode.workspace.workspaceFolders;
    if (folders) {
      const normalize = (p: string) =>
        p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

      const normalizedCwd = normalize(cwdOrDirName);

      for (const folder of folders) {
        if (normalize(folder.uri.fsPath) === normalizedCwd) {
          return folder.name;
        }
      }

      // Check if cwd is a child of a workspace folder
      for (const folder of folders) {
        if (normalizedCwd.startsWith(normalize(folder.uri.fsPath) + "/")) {
          const relative = cwdOrDirName
            .replace(/\\/g, "/")
            .slice(folder.uri.fsPath.replace(/\\/g, "/").length + 1);
          return `${folder.name}/${relative.split("/")[0]}`;
        }
      }
    }

    return path.basename(cwdOrDirName);
  }

  getSnapshot(): { connected: boolean; sessions: PanelSession[] } {
    return {
      connected: this.connectedEmitted,
      sessions: this.findActiveSessions(),
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.removeAllListeners();
  }
}
