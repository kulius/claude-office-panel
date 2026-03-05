import * as vscode from "vscode";
import { PanelManager } from "./PanelManager";
import { LocalSessionScanner } from "./LocalSessionScanner";
import type { PanelSession } from "./types";

let panelManager: PanelManager | undefined;
let scanner: LocalSessionScanner | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
const activeSessions = new Set<string>();
const log = vscode.window.createOutputChannel("Claude Office Panel");

function ensureStarted(context: vscode.ExtensionContext): void {
  if (!panelManager) {
    panelManager = new PanelManager(context.extensionUri);
    panelManager.setOnDispose(() => {
      // Panel closed -- keep scanner running for status bar
    });
    panelManager.setOnReady(() => hydratePanel());
  }
  if (!scanner) {
    startScanner();
  }
}

function hydratePanel(): void {
  log.appendLine(`hydratePanel: scanner=${!!scanner}, visible=${panelManager?.isVisible}`);
  if (!scanner || !panelManager?.isVisible) return;
  const snapshot = scanner.getSnapshot();
  log.appendLine(`snapshot: connected=${snapshot.connected}, sessions=${snapshot.sessions.length}`);
  for (const s of snapshot.sessions) {
    log.appendLine(`  ${s.sessionId.slice(0, 8)} project=${s.projectName} boss=${s.boss.state} agents=${s.agents.length}`);
  }
  panelManager.postMessage({ type: "connectionStatus", connected: snapshot.connected });
  for (const session of snapshot.sessions) {
    panelManager.postMessage({ type: "sessionUpdate", session });
  }
}

export function activate(context: vscode.ExtensionContext): void {
  log.appendLine("Claude Office Panel activating...");

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "claudeOfficePanel.open";
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register command
  const openCmd = vscode.commands.registerCommand(
    "claudeOfficePanel.open",
    () => {
      log.appendLine("Open panel command triggered");
      ensureStarted(context);
      panelManager!.open();
    }
  );
  context.subscriptions.push(openCmd);

  // Cleanup on deactivate
  context.subscriptions.push({
    dispose() {
      scanner?.dispose();
      panelManager?.dispose();
    },
  });

  // Start scanner eagerly so status bar shows session count
  ensureStarted(context);
  log.appendLine("Claude Office Panel activated OK");
}

function startScanner(): void {
  scanner = new LocalSessionScanner();

  scanner.on("sessionUpdate", (session: PanelSession) => {
    activeSessions.add(session.sessionId);
    panelManager?.postMessage({ type: "sessionUpdate", session });
    updateStatusBar();
  });

  scanner.on("sessionRemoved", (sessionId: string) => {
    activeSessions.delete(sessionId);
    panelManager?.postMessage({ type: "sessionRemoved", sessionId });
    updateStatusBar();
  });

  scanner.start();
  log.appendLine(`Scanner started. claudeProjectsDir=${scanner.claudeProjectsDir}`);
}

function updateStatusBar(): void {
  if (!statusBarItem) return;
  const count = activeSessions.size;
  statusBarItem.text = count > 0
    ? `$(hubot) ${count} session${count !== 1 ? "s" : ""}`
    : "$(hubot) Claude Office";
  statusBarItem.tooltip = "Open Claude Office Panel";
}

export function deactivate(): void {
  scanner?.dispose();
  panelManager?.dispose();
}
