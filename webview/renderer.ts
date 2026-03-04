import type { BossState, PanelSession, BubbleContent } from "./types";
import {
  getClusterPositions,
  getAgentPositions,
  BOSS_SIZE,
  AGENT_SIZE,
} from "./layout";

const BOSS_COLORS: Record<BossState, string> = {
  idle: "#2d3748",
  phone_ringing: "#d97706",
  on_phone: "#d97706",
  receiving: "#06b6d4",
  working: "#ef4444",
  delegating: "#a855f7",
  waiting_permission: "#eab308",
  reviewing: "#06b6d4",
  completing: "#22c55e",
};

const ACTIVE_STATES = new Set([
  "working",
  "thinking",
  "reporting",
  "walking_to_desk",
]);

function isActiveState(state: string): boolean {
  return ACTIVE_STATES.has(state);
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "\u2026" : text;
}

function createBubbleEl(bubble: BubbleContent): HTMLElement {
  const el = document.createElement("div");
  el.className = `bubble ${bubble.persistent ? "" : "bubble-fade"}`;
  const icon = bubble.icon ?? (bubble.type === "thought" ? "\uD83D\uDCAD" : "\uD83D\uDCAC");
  el.textContent = `${icon} ${truncate(bubble.text, 30)}`;
  return el;
}

export function render(
  container: HTMLElement,
  sessions: PanelSession[],
  connected: boolean
): void {
  // Clear
  container.innerHTML = "";

  if (!connected) {
    const msg = document.createElement("div");
    msg.className = "offline-message";
    msg.innerHTML =
      '<div class="offline-icon">\uD83D\uDD0C</div>' +
      "<p>Waiting for claude-office backend\u2026</p>" +
      "<p class=\"offline-hint\">Start it with: <code>cd claude-office && make dev-tmux</code></p>";
    container.appendChild(msg);
    return;
  }

  if (sessions.length === 0) {
    const msg = document.createElement("div");
    msg.className = "offline-message";
    msg.innerHTML =
      '<div class="offline-icon">\uD83C\uDFE2</div>' +
      "<p>No active sessions</p>" +
      '<p class="offline-hint">Open a terminal and run <code>claude</code> to see agents appear</p>';
    container.appendChild(msg);
    return;
  }

  const positions = getClusterPositions(sessions.length, container.clientWidth);

  sessions.forEach((session, i) => {
    const pos = positions[i];
    const cluster = document.createElement("div");
    cluster.className = "cluster";
    cluster.style.left = `${pos.x}px`;
    cluster.style.top = `${pos.y}px`;

    // Boss
    const bossEl = document.createElement("div");
    bossEl.className = `character boss ${isActiveState(session.boss.state) ? "working" : ""}`;
    bossEl.style.width = `${BOSS_SIZE}px`;
    bossEl.style.height = `${Math.round(BOSS_SIZE * 1.67)}px`;
    bossEl.style.backgroundColor = BOSS_COLORS[session.boss.state] ?? "#2d3748";
    bossEl.title = `${session.projectName} — ${session.boss.state}${
      session.boss.currentTask ? `\n${session.boss.currentTask}` : ""
    }`;

    // Boss tie
    const tie = document.createElement("div");
    tie.className = "tie";
    bossEl.appendChild(tie);

    // Boss bubble
    if (session.boss.bubble) {
      bossEl.appendChild(createBubbleEl(session.boss.bubble));
    }

    cluster.appendChild(bossEl);

    // Boss label
    const bossLabel = document.createElement("div");
    bossLabel.className = "label boss-label";
    bossLabel.textContent = truncate(session.projectName, 16);
    cluster.appendChild(bossLabel);

    // State badge
    const badge = document.createElement("div");
    badge.className = "state-badge";
    badge.textContent = session.boss.state;
    cluster.appendChild(badge);

    // Agents in a circle
    const agentPositions = getAgentPositions(
      session.agents.length,
      0,
      0
    );

    session.agents.forEach((agent, j) => {
      const aPos = agentPositions[j];
      const agentEl = document.createElement("div");
      agentEl.className = `character agent ${isActiveState(agent.state) ? "working" : ""} ${
        agent.state === "leaving" || agent.state === "completed" ? "leaving" : ""
      } ${agent.state === "arriving" || agent.state === "in_elevator" ? "arriving" : ""}`;
      agentEl.style.width = `${AGENT_SIZE}px`;
      agentEl.style.height = `${Math.round(AGENT_SIZE * 1.67)}px`;
      agentEl.style.backgroundColor = agent.color;
      agentEl.style.left = `${aPos.x}px`;
      agentEl.style.top = `${aPos.y}px`;
      agentEl.title = `${agent.name ?? agent.id.slice(0, 8)} — ${agent.state}${
        agent.currentTask ? `\n${agent.currentTask}` : ""
      }`;

      // Agent bubble
      if (agent.bubble) {
        agentEl.appendChild(createBubbleEl(agent.bubble));
      }

      cluster.appendChild(agentEl);

      // Agent label
      const agentLabel = document.createElement("div");
      agentLabel.className = "label agent-label";
      agentLabel.style.left = `${aPos.x}px`;
      agentLabel.style.top = `${aPos.y + AGENT_SIZE * 1.67 / 2 + 4}px`;
      agentLabel.textContent = truncate(
        agent.name ?? agent.currentTask ?? agent.id.slice(0, 8),
        12
      );
      cluster.appendChild(agentLabel);
    });

    container.appendChild(cluster);
  });
}
