# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**claude-office-panel** is a VS Code extension (v0.1.0) that visualizes active Claude Code sessions as an animated "office" inside a webview panel. It scans `~/.claude/projects/` for `.jsonl` session files, infers boss/agent states from recent activity, and renders pixel-art-style characters with CSS animations.

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
- **`BackendClient.ts`** — Alternative data source (currently unused in favor of LocalSessionScanner). Connects to a claude-office backend at `localhost:8000` via HTTP + WebSocket. Handles reconnection with exponential backoff.
- **`PanelManager.ts`** — Creates/manages the webview panel. Generates HTML with CSP nonce, serves bundled JS/CSS from `dist/webview/`. Forwards `ExtensionToWebviewMessage` to the webview.
- **`SessionMapper.ts`** — Maps session project roots to VS Code workspace folder names. Tracks terminal open/close for potential future terminal correlation.
- **`types.ts`** — Shared type definitions for `PanelSession`, `Agent`, `Boss`, `GameState`, state enums, and message protocols.

### Webview side (`webview/`)

Runs in the webview's browser sandbox. Types are duplicated in `webview/types.ts` because esbuild bundles them separately.

- **`main.ts`** — Listens for `postMessage` from extension, updates store, triggers re-render. Persists state via `vscode.setState()`.
- **`state.ts`** — Simple observable store (Map of sessions + subscriber pattern).
- **`renderer.ts`** — DOM-based rendering. Each session becomes a "cluster" with a boss character (colored by state) and agents arranged in a circle. CSS classes drive animations (bounce for working, scale for arriving/leaving).
- **`layout.ts`** — Grid layout math. `getClusterPositions()` arranges session clusters in columns. `getAgentPositions()` places agents in a circle around the boss.
- **`styles.css`** — Uses VS Code theme CSS variables. Characters are rounded rectangles with `::before` pseudo-element heads. Animations: bounce (working), arrive (scale in), leave (scale out), bubble fade.

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
| Cluster size | 140x130px | `layout.ts:6-7` |
| Boss size | 28px | `layout.ts:9` |
| Agent size | 20px | `layout.ts:10` |
