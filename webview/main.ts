import { store } from "./state";
import { render } from "./renderer";
import type { ExtensionToWebviewMessage } from "./types";

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();
const canvas = document.getElementById("office-canvas")!;
const statusBar = document.getElementById("status-bar")!;

// Listen for messages from extension
window.addEventListener("message", (event: MessageEvent<ExtensionToWebviewMessage>) => {
  const msg = event.data;
  switch (msg.type) {
    case "sessionUpdate":
      store.updateSession(msg.session);
      break;
    case "sessionRemoved":
      store.removeSession(msg.sessionId);
      break;
    case "connectionStatus":
      store.setConnected(msg.connected);
      break;
  }
});

// Re-render on state changes
store.subscribe(() => {
  render(canvas, store.getSessions(), store.connected);
  updateStatusBar();
  vscode.setState({
    sessions: store.getSessions(),
    connected: store.connected,
  });
});

function updateStatusBar(): void {
  const sessionCount = store.getSessionCount();
  const agentCount = store.getTotalAgentCount();

  if (!store.connected) {
    statusBar.textContent = "Disconnected";
    statusBar.className = "disconnected";
  } else if (sessionCount === 0) {
    statusBar.textContent = "Connected -- no active sessions";
    statusBar.className = "";
  } else {
    statusBar.textContent = `${sessionCount} session${sessionCount !== 1 ? "s" : ""} | ${agentCount} agent${agentCount !== 1 ? "s" : ""}`;
    statusBar.className = "";
  }
}

// Handle resize
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener("resize", () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    render(canvas, store.getSessions(), store.connected);
  }, 100);
});

// Restore state if available
const savedState = vscode.getState() as {
  sessions?: Array<{ sessionId: string }>;
  connected?: boolean;
} | null;

if (savedState?.connected !== undefined) {
  store.setConnected(savedState.connected);
}

// Tell extension we're ready to receive data
vscode.postMessage({ type: "webviewReady" });

// Initial render
render(canvas, store.getSessions(), store.connected);
updateStatusBar();
