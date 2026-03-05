import * as vscode from "vscode";
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from "./types";

export class PanelManager {
  private panel: vscode.WebviewPanel | undefined;
  private readonly extensionUri: vscode.Uri;
  private onDispose?: () => void;
  private onReady?: () => void;
  private onMessage?: (msg: WebviewToExtensionMessage) => void;

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  setOnDispose(cb: () => void): void {
    this.onDispose = cb;
  }

  setOnReady(cb: () => void): void {
    this.onReady = cb;
  }

  setOnMessage(cb: (msg: WebviewToExtensionMessage) => void): void {
    this.onMessage = cb;
  }

  open(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "claudeOfficePanel",
      "Claude Office",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, "dist", "webview"),
        ],
      }
    );

    this.panel.webview.html = this.getHtml();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage((msg: WebviewToExtensionMessage) => {
      if (msg.type === "webviewReady") {
        this.onReady?.();
      } else {
        this.onMessage?.(msg);
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.onDispose?.();
    });
  }

  postMessage(msg: ExtensionToWebviewMessage): void {
    this.panel?.webview.postMessage(msg);
  }

  get isVisible(): boolean {
    return this.panel !== undefined;
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  private getHtml(): string {
    const webview = this.panel!.webview;
    const distWebview = vscode.Uri.joinPath(
      this.extensionUri,
      "dist",
      "webview"
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distWebview, "styles.css")
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distWebview, "main.js")
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src data:;">
  <link href="${styleUri}" rel="stylesheet">
  <title>Claude Office</title>
</head>
<body>
  <div id="office-canvas"></div>
  <div id="status-bar"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
