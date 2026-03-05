import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { PanelManager } from "./PanelManager";
import { LocalSessionScanner } from "./LocalSessionScanner";
import type { PanelSession, WebviewToExtensionMessage } from "./types";

const AVATAR_STATE_KEY = "characterAvatars";

let panelManager: PanelManager | undefined;
let scanner: LocalSessionScanner | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
const activeSessions = new Set<string>();

function ensureStarted(context: vscode.ExtensionContext): void {
  if (!panelManager) {
    panelManager = new PanelManager(context.extensionUri);
    panelManager.setOnDispose(() => {
      // Panel closed — keep scanner running for status bar
    });
    panelManager.setOnReady(() => hydratePanel());
    panelManager.setOnMessage((msg) => handleWebviewMessage(msg));
  }
  if (!scanner) {
    startScanner();
  }
}

function hydratePanel(): void {
  if (!scanner || !panelManager?.isVisible) return;
  const snapshot = scanner.getSnapshot();
  panelManager.postMessage({ type: "connectionStatus", connected: snapshot.connected });
  for (const session of snapshot.sessions) {
    panelManager.postMessage({ type: "sessionUpdate", session });
  }
  // Send saved avatars
  const avatars = getAvatarMap();
  panelManager.postMessage({ type: "avatarMap", avatars });
}

function normalizeCwd(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function getAvatarMap(): Record<string, string> {
  return extensionContext?.globalState.get<Record<string, string>>(AVATAR_STATE_KEY) ?? {};
}

async function saveAvatar(cwd: string, dataUri: string): Promise<void> {
  const avatars = { ...getAvatarMap(), [normalizeCwd(cwd)]: dataUri };
  await extensionContext?.globalState.update(AVATAR_STATE_KEY, avatars);
}

async function removeAvatar(cwd: string): Promise<void> {
  const avatars = { ...getAvatarMap() };
  delete avatars[normalizeCwd(cwd)];
  await extensionContext?.globalState.update(AVATAR_STATE_KEY, avatars);
}

export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context;
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
}

function handleWebviewMessage(msg: WebviewToExtensionMessage): void {
  if (msg.type === "focusSession") {
    focusTerminalForSession(msg.cwd);
  } else if (msg.type === "changeAvatar") {
    handleChangeAvatar(msg.cwd);
  }
}

async function handleChangeAvatar(cwd?: string): Promise<void> {
  if (!cwd) return;

  const pick = await vscode.window.showQuickPick(
    [
      { label: "$(file-media) Choose Image File...", action: "pick" as const },
      { label: "$(discard) Reset to Default", action: "reset" as const },
    ],
    { placeHolder: "Set character avatar for this project" }
  );

  if (!pick) return;

  if (pick.action === "reset") {
    await removeAvatar(cwd);
    panelManager?.postMessage({ type: "avatarMap", avatars: getAvatarMap() });
    return;
  }

  const files = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { Images: ["png", "jpg", "jpeg", "gif", "webp", "svg"] },
    title: "Select Character Avatar",
  });

  if (!files || files.length === 0) return;

  try {
    const filePath = files[0].fsPath;
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime = ext === "svg" ? "image/svg+xml"
      : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
      : ext === "webp" ? "image/webp"
      : ext === "gif" ? "image/gif"
      : "image/png";
    const dataUri = `data:${mime};base64,${buffer.toString("base64")}`;

    await saveAvatar(cwd, dataUri);
    panelManager?.postMessage({ type: "avatarMap", avatars: getAvatarMap() });
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to read image: ${err}`);
  }
}

function focusTerminalForSession(cwd?: string): void {
  if (!cwd) return;

  const normalize = (p: string) =>
    p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const targetCwd = normalize(cwd);

  for (const terminal of vscode.window.terminals) {
    // Try shellIntegration.cwd (VS Code 1.93+)
    const termCwd = (terminal as unknown as { shellIntegration?: { cwd?: { fsPath?: string } } })
      .shellIntegration?.cwd?.fsPath;
    if (termCwd && normalize(termCwd) === targetCwd) {
      terminal.show();
      return;
    }

    // Fallback: match terminal name against the last folder name
    const folderName = path.basename(cwd).toLowerCase();
    if (terminal.name.toLowerCase().includes(folderName)) {
      terminal.show();
      return;
    }
  }

  // No matching terminal found — just show the first Claude-like terminal
  for (const terminal of vscode.window.terminals) {
    if (terminal.name.toLowerCase().includes("claude")) {
      terminal.show();
      return;
    }
  }
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
