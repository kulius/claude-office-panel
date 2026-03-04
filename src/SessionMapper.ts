import * as vscode from "vscode";
import * as path from "path";

/**
 * Maps claude-office sessions to VS Code terminals by comparing
 * session projectRoot with workspace folders.
 */
export class SessionMapper {
  private terminalNames = new Map<string, string>();
  private disposables: vscode.Disposable[] = [];

  constructor() {
    // Track terminal opens/closes
    this.disposables.push(
      vscode.window.onDidOpenTerminal((t) => this.onTerminalOpened(t)),
      vscode.window.onDidCloseTerminal((t) => this.onTerminalClosed(t))
    );

    // Index existing terminals
    for (const t of vscode.window.terminals) {
      this.terminalNames.set(t.name, t.name);
    }
  }

  private onTerminalOpened(terminal: vscode.Terminal): void {
    this.terminalNames.set(terminal.name, terminal.name);
  }

  private onTerminalClosed(terminal: vscode.Terminal): void {
    this.terminalNames.delete(terminal.name);
  }

  /**
   * Resolve a display name for a session based on its projectRoot.
   * Returns the workspace folder name if it matches, otherwise the
   * last path segment.
   */
  resolveProjectName(projectRoot: string | null | undefined): string {
    if (!projectRoot) return "unknown";

    const folders = vscode.workspace.workspaceFolders;
    if (folders) {
      for (const folder of folders) {
        const folderPath = folder.uri.fsPath;
        if (this.pathsEqual(folderPath, projectRoot)) {
          return folder.name;
        }
      }
    }

    return path.basename(projectRoot);
  }

  private pathsEqual(a: string, b: string): boolean {
    const normalize = (p: string) =>
      p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    return normalize(a) === normalize(b);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.terminalNames.clear();
  }
}
