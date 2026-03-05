# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**claude-office-panel** is a VS Code extension (v0.2.3) that visualizes active Claude Code sessions as an animated "office" inside a webview panel. It scans `~/.claude/projects/` for `.jsonl` session files, infers boss/agent states from recent activity, and renders pixel-art-style characters with CSS animations and bilingual (Chinese/English) state labels.

## Build & Development

```bash
npm install
npm run build          # Production build (minified)
npm run watch          # Dev mode with hot-reload
npm run lint           # TypeScript type-check (tsc --noEmit)
npm run package        # Build .vsix for distribution
```

The build uses esbuild (configured in `esbuild.mjs`) with two entry points:
- **Extension** (Node.js/CommonJS): `src/extension.ts` -> `dist/extension.js`
- **Webview** (browser/IIFE): `webview/main.ts` -> `dist/webview/main.js`

Static assets (`webview/index.html`, `webview/styles.css`) are copied to `dist/webview/` during build.

To test: open this folder in VS Code, press F5 to launch Extension Development Host, then run command `Claude Office: Open Panel` (or `Ctrl+Shift+Alt+O`).

## Architecture

Two separate TypeScript codebases compiled independently (they cannot import from each other):

### Extension side (`src/`)

Runs in VS Code's Node.js host process.

- **`extension.ts`** — Entry point. Registers the `claudeOfficePanel.open` command, manages status bar item showing session count, wires up the scanner and panel.
- **`LocalSessionScanner.ts`** — Primary data source. Polls `~/.claude/projects/` every 3 seconds, reads `.jsonl` files (tail for state inference, head for cwd), infers `BossState`/`AgentState` from timestamps and message types. Also scans `{sessionDir}/{sessionId}/subagents/agent-*.jsonl` for subagent detection. Emits `sessionUpdate`, `sessionRemoved`, `connected` events.
- **`PanelManager.ts`** — Creates/manages the webview panel. Generates HTML with CSP nonce and cache-busting query params, serves bundled JS/CSS from `dist/webview/`. Forwards `ExtensionToWebviewMessage` to the webview.
- **`types.ts`** — Shared type definitions for `PanelSession`, `Agent`, `Boss`, state enums, and message protocols.

### Webview side (`webview/`)

Runs in the webview's browser sandbox. Types are duplicated in `webview/types.ts` because esbuild bundles them separately.

- **`main.ts`** — Listens for `postMessage` from extension, updates store, triggers re-render. Persists state via `vscode.setState()`.
- **`state.ts`** — Simple observable store (Map of sessions + subscriber pattern).
- **`renderer.ts`** — DOM-based rendering. Each session becomes a "cluster" card with a boss pixel-person (colored by state), bilingual state badge, and agents in a row below. CSS classes drive animations (bounce for working, scale for arriving/leaving).
- **`layout.ts`** — Minimal layout utilities (truncate helper).
- **`styles.css`** — Uses VS Code theme CSS variables. Pixel-art characters built from div elements (hair, head with eyes/mouth, body with arms, legs). Flexbox card layout. Animations: bounce (working), arrive (scale in), leave (scale out), idle sway, bubble fade.

### Data Flow

```
~/.claude/projects/**/*.jsonl
    |
    v  (fs polling every 3s)
LocalSessionScanner  -- infers BossState/AgentState from timestamps + message types
    |
    v  (EventEmitter)
extension.ts  -- forwards as ExtensionToWebviewMessage
    |
    v  (webview.postMessage)
webview/main.ts -> store -> renderer -> DOM
```

### State Inference Logic (LocalSessionScanner)

- **Active threshold**: 10 minutes (sessions older are ignored)
- **Boss state**: `idle` (>2min old), `working` (assistant msg <30s), `receiving` (user msg <30s), `reviewing` (default recent)
- **Agent state**: `waiting` (no data), `completed` (>2min), `working` (<30s), `thinking` (30s-2min)
- **Agent colors**: Deterministic hash of agent ID into 8-color palette

### Key Constants

| Constant | Value | Location |
|----------|-------|----------|
| Poll interval | 3000ms | `LocalSessionScanner.ts:8` |
| Active threshold | 10 min | `LocalSessionScanner.ts:9` |

### Deployment Note

The extension runs as an **installed VSIX**, not from the workspace `dist/` folder. After building:

```bash
npm run build && npm run package
code --install-extension claude-office-panel-X.Y.Z.vsix --force
# Then: Developer: Reload Window
```

Or for quick iteration, copy dist files directly:
```bash
cp dist/webview/* ~/.vscode/extensions/kulius.claude-office-panel-X.Y.Z/dist/webview/
cp dist/extension.js ~/.vscode/extensions/kulius.claude-office-panel-X.Y.Z/dist/
# Then: Developer: Reload Window
```
