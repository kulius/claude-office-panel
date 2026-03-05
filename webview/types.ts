/** Webview-side type definitions (duplicated to avoid import issues with esbuild) */

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

export interface PanelAgent {
  readonly id: string;
  readonly name?: string;
  readonly color: string;
  readonly state: AgentState;
  readonly bubble?: BubbleContent;
  readonly currentTask?: string;
}

export interface PanelSession {
  readonly sessionId: string;
  readonly projectName: string;
  readonly cwd?: string;
  readonly boss: {
    readonly state: BossState;
    readonly bubble?: BubbleContent;
    readonly currentTask?: string;
  };
  readonly agents: readonly PanelAgent[];
}

export type ExtensionToWebviewMessage =
  | { readonly type: "sessionUpdate"; readonly session: PanelSession }
  | { readonly type: "sessionRemoved"; readonly sessionId: string }
  | { readonly type: "connectionStatus"; readonly connected: boolean };
