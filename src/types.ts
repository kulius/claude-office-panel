/** Minimal type subset from claude-office frontend/src/types/index.ts */

export type BubbleType = "thought" | "speech";

export interface BubbleContent {
  readonly type: BubbleType;
  readonly text: string;
  readonly icon?: string;
  readonly persistent?: boolean;
}

export type AgentState =
  | "arriving"
  | "reporting"
  | "walking_to_desk"
  | "working"
  | "thinking"
  | "waiting_permission"
  | "completed"
  | "waiting"
  | "reporting_done"
  | "leaving"
  | "in_elevator";

export type BossState =
  | "idle"
  | "phone_ringing"
  | "on_phone"
  | "receiving"
  | "working"
  | "delegating"
  | "waiting_permission"
  | "reviewing"
  | "completing";

export interface Agent {
  readonly id: string;
  readonly name?: string;
  readonly color: string;
  readonly number: number;
  readonly state: AgentState;
  readonly bubble?: BubbleContent;
  readonly currentTask?: string;
}

export interface Boss {
  readonly state: BossState;
  readonly currentTask?: string;
  readonly bubble?: BubbleContent;
}

export interface GameState {
  readonly sessionId: string;
  readonly boss: Boss;
  readonly agents: readonly Agent[];
}

export interface SessionSummary {
  readonly id: string;
  readonly projectName: string | null;
  readonly projectRoot: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: string;
  readonly eventCount: number;
}

export interface WebSocketMessage {
  readonly type:
    | "state_update"
    | "event"
    | "reload"
    | "git_status"
    | "session_deleted";
  readonly timestamp: string;
  readonly state?: GameState;
  readonly session_id?: string;
}

/** Panel-specific session representation for the webview */
export interface PanelSession {
  readonly sessionId: string;
  readonly projectName: string;
  readonly cwd?: string;
  readonly boss: {
    readonly state: BossState;
    readonly bubble?: BubbleContent;
    readonly currentTask?: string;
  };
  readonly agents: ReadonlyArray<{
    readonly id: string;
    readonly name?: string;
    readonly color: string;
    readonly state: AgentState;
    readonly bubble?: BubbleContent;
    readonly currentTask?: string;
  }>;
}

/** Messages from extension to webview */
export type ExtensionToWebviewMessage =
  | { readonly type: "sessionUpdate"; readonly session: PanelSession }
  | { readonly type: "sessionRemoved"; readonly sessionId: string }
  | { readonly type: "connectionStatus"; readonly connected: boolean };

/** Messages from webview to extension */
export type WebviewToExtensionMessage =
  | { readonly type: "webviewReady" };
