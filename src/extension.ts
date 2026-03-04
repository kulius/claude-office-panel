import * as vscode from "vscode";
import { PanelManager } from "./PanelManager";
import { BackendClient } from "./BackendClient";
import { SessionMapper } from "./SessionMapper";
import type { PanelSession } from "./types";

let panelManager: PanelManager | undefined;
let backendClient: BackendClient | undefined;
let sessionMapper: SessionMapper | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let agentCount = 0;

export function activate(context: vscode.ExtensionContext): void {
  sessionMapper = new SessionMapper();

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "claudeOfficePanel.open";
  updateStatusBar(0);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register command
  const openCmd = vscode.commands.registerCommand(
    "claudeOfficePanel.open",
    () => {
      if (!panelManager) {
        panelManager = new PanelManager(context.extensionUri);
        panelManager.setOnDispose(() => {
          // Panel closed — keep backend running for status bar
        });
      }
      panelManager.open();

      // Start backend client if not running
      if (!backendClient) {
        startBackendClient();
      }
    }
  );
  context.subscriptions.push(openCmd);

  // Cleanup on deactivate
  context.subscriptions.push({
    dispose() {
      backendClient?.dispose();
      panelManager?.dispose();
      sessionMapper?.dispose();
    },
  });

  // Auto-open panel on startup
  panelManager = new PanelManager(context.extensionUri);
  panelManager.setOnDispose(() => {
    // Panel closed — keep backend running for status bar
  });
  panelManager.open();
  startBackendClient();
}

function startBackendClient(): void {
  backendClient = new BackendClient();

  backendClient.on("sessionUpdate", (session: PanelSession) => {
    panelManager?.postMessage({ type: "sessionUpdate", session });
    recountAgents();
  });

  backendClient.on("sessionRemoved", (sessionId: string) => {
    panelManager?.postMessage({ type: "sessionRemoved", sessionId });
    recountAgents();
  });

  backendClient.on("connected", (status: boolean) => {
    panelManager?.postMessage({ type: "connectionStatus", connected: status });
  });

  backendClient.start();
}

function recountAgents(): void {
  // We rely on sessionUpdate messages to count — simplified for status bar
  // The actual count is maintained by the webview, but we track approximately here
}

function updateStatusBar(count: number): void {
  if (!statusBarItem) return;
  agentCount = count;
  statusBarItem.text = count > 0 ? `$(hubot) ${count} agents` : "$(hubot) Claude Office";
  statusBarItem.tooltip = "Open Claude Office Panel";
}

export function deactivate(): void {
  backendClient?.dispose();
  panelManager?.dispose();
  sessionMapper?.dispose();
}
