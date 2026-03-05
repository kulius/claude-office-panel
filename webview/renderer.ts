import type { BossState, PanelSession, BubbleContent } from "./types";
import {
  getClusterPositions,
  getAgentPositions,
} from "./layout";

/* Body color by boss state */
const BOSS_BODY_COLORS: Record<BossState, string> = {
  idle: "#4a5568",
  phone_ringing: "#d97706",
  on_phone: "#d97706",
  receiving: "#06b6d4",
  working: "#ef4444",
  delegating: "#a855f7",
  waiting_permission: "#eab308",
  reviewing: "#06b6d4",
  completing: "#22c55e",
};

/* Bilingual state labels */
const STATE_LABELS: Record<string, string> = {
  idle: "閒置 idle",
  phone_ringing: "電話響 ring",
  on_phone: "通話中 call",
  receiving: "接收中 recv",
  working: "工作中 work",
  delegating: "派工中 delegate",
  waiting_permission: "等待授權 wait",
  reviewing: "審查中 review",
  completing: "完成 done",
  thinking: "思考中 think",
  waiting: "等待中 wait",
  completed: "已完成 done",
  arriving: "進入中 arrive",
  leaving: "離開中 leave",
  in_elevator: "進入中 arrive",
  reporting: "報告中 report",
  walking_to_desk: "就座中 walk",
};

/* Skin tone palette */
const SKIN = "#fdd8b5";
/* Hair colors for agents (deterministic from agent color) */
const HAIR_COLORS = ["#4a3728", "#2d1b0e", "#8b6914", "#c0392b", "#1a1a2e", "#5b3a29", "#e67e22", "#7f8c8d"];
/* Pants colors */
const PANTS_COLORS = ["#2c3e50", "#34495e", "#1a237e", "#4a148c", "#263238"];

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

function stateLabel(state: string): string {
  return STATE_LABELS[state] ?? state;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function createBubbleEl(bubble: BubbleContent): HTMLElement {
  const el = document.createElement("div");
  el.className = `bubble ${bubble.persistent ? "" : "bubble-fade"}`;
  const icon = bubble.icon ?? (bubble.type === "thought" ? "\uD83D\uDCAD" : "\uD83D\uDCAC");
  el.textContent = `${icon} ${truncate(bubble.text, 30)}`;
  return el;
}

/**
 * Build a pixel-art person element.
 * isBoss: larger size, has tie
 * bodyColor: shirt/body color
 * hairColor: hair color
 * pantsColor: leg color
 */
function createPixelPerson(
  isBoss: boolean,
  bodyColor: string,
  hairColor: string,
  pantsColor: string,
): HTMLElement {
  const wrap = document.createElement("div");

  // Hair
  const hair = document.createElement("div");
  hair.className = "pixel-hair";
  hair.style.backgroundColor = hairColor;
  wrap.appendChild(hair);

  // Head
  const head = document.createElement("div");
  head.className = "pixel-head";
  head.style.backgroundColor = SKIN;
  wrap.appendChild(head);

  // Body
  const body = document.createElement("div");
  body.className = "pixel-body";
  body.style.backgroundColor = bodyColor;
  wrap.appendChild(body);

  // Boss tie
  if (isBoss) {
    const tie = document.createElement("div");
    tie.className = "pixel-tie";
    tie.style.backgroundColor = "#e74c3c";
    body.appendChild(tie);
  }

  // Legs
  const legs = document.createElement("div");
  legs.className = "pixel-legs";
  const legL = document.createElement("div");
  legL.className = "pixel-leg";
  legL.style.backgroundColor = pantsColor;
  const legR = document.createElement("div");
  legR.className = "pixel-leg";
  legR.style.backgroundColor = pantsColor;
  legs.appendChild(legL);
  legs.appendChild(legR);
  wrap.appendChild(legs);

  return wrap;
}

export type SessionClickHandler = (sessionId: string, cwd?: string) => void;

let onSessionClick: SessionClickHandler | undefined;
let onSessionDblClick: SessionClickHandler | undefined;

export function setOnSessionClick(handler: SessionClickHandler): void {
  onSessionClick = handler;
}

export function setOnSessionDblClick(handler: SessionClickHandler): void {
  onSessionDblClick = handler;
}

interface AvatarStore {
  getAvatar(cwd?: string): string | undefined;
}

/** Create an avatar image element to replace the pixel person */
function createAvatarImg(dataUri: string, size: number): HTMLElement {
  const img = document.createElement("img");
  img.src = dataUri;
  img.className = "avatar-img";
  img.style.width = `${size}px`;
  img.style.height = `${size}px`;
  img.draggable = false;
  return img;
}

export function render(
  container: HTMLElement,
  sessions: PanelSession[],
  connected: boolean,
  avatarStore?: AvatarStore
): void {
  container.innerHTML = "";

  if (!connected) {
    const msg = document.createElement("div");
    msg.className = "offline-message";
    msg.innerHTML =
      '<div class="offline-icon">\uD83D\uDD0C</div>' +
      "<p>Scanning for Claude Code sessions\u2026</p>" +
      "<p class=\"offline-hint\">Sessions in <code>~/.claude/projects/</code></p>";
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

  // Inject arm color rule once
  ensureArmStyle();

  const positions = getClusterPositions(sessions.length, container.clientWidth);

  sessions.forEach((session, i) => {
    const pos = positions[i];
    const cluster = document.createElement("div");
    cluster.className = "cluster";
    cluster.style.left = `${pos.x}px`;
    cluster.style.top = `${pos.y}px`;

    // Boss
    const bossState = session.boss.state;
    const bodyColor = BOSS_BODY_COLORS[bossState] ?? "#4a5568";
    const bossEl = document.createElement("div");
    const stateClass = `state-${bossState}`;
    bossEl.className = `character boss ${stateClass} ${isActiveState(bossState) ? "working" : ""}`;
    bossEl.title = `${session.projectName} — ${bossState}${
      session.boss.currentTask ? `\n${session.boss.currentTask}` : ""
    }`;

    // Use custom avatar or default pixel person
    const avatarUri = avatarStore?.getAvatar(session.cwd);
    if (avatarUri) {
      bossEl.appendChild(createAvatarImg(avatarUri, 40));
    } else {
      bossEl.appendChild(createPixelPerson(true, bodyColor, "#2d1b0e", "#2c3e50"));
    }

    // Click to focus terminal, double-click to change avatar
    bossEl.style.cursor = "pointer";
    const sid = session.sessionId;
    const scwd = session.cwd;
    bossEl.addEventListener("click", () => onSessionClick?.(sid, scwd));
    bossEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      onSessionDblClick?.(sid, scwd);
    });

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
    badge.textContent = stateLabel(bossState);
    cluster.appendChild(badge);

    // Agents
    const agentPositions = getAgentPositions(session.agents.length, 0, 0);

    session.agents.forEach((agent, j) => {
      const aPos = agentPositions[j];
      const h = hashStr(agent.id);
      const agentHair = HAIR_COLORS[h % HAIR_COLORS.length];
      const agentPants = PANTS_COLORS[h % PANTS_COLORS.length];
      const agentBody = agent.color;

      const agentEl = document.createElement("div");
      agentEl.className = `character agent ${isActiveState(agent.state) ? "working" : ""} ${
        agent.state === "leaving" || agent.state === "completed" ? "leaving" : ""
      } ${agent.state === "arriving" || agent.state === "in_elevator" ? "arriving" : ""}`;
      agentEl.style.left = `${aPos.x}px`;
      agentEl.style.top = `${aPos.y}px`;
      agentEl.title = `${agent.name ?? agent.id.slice(0, 8)} — ${agent.state}${
        agent.currentTask ? `\n${agent.currentTask}` : ""
      }`;

      const agentPerson = createPixelPerson(false, agentBody, agentHair, agentPants);
      agentEl.appendChild(agentPerson);

      // Agent bubble
      if (agent.bubble) {
        agentEl.appendChild(createBubbleEl(agent.bubble));
      }

      cluster.appendChild(agentEl);

      // Agent label (above the agent in semi-circle layout)
      const agentLabel = document.createElement("div");
      agentLabel.className = "label agent-label";
      agentLabel.style.left = `${aPos.x}px`;
      agentLabel.style.top = `${aPos.y - 22}px`;
      agentLabel.textContent = truncate(
        agent.name ?? agent.currentTask ?? "Agent",
        14
      );
      cluster.appendChild(agentLabel);
    });

    container.appendChild(cluster);
  });
}

let armStyleInjected = false;
function ensureArmStyle(): void {
  if (armStyleInjected) return;
  armStyleInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .pixel-body::before,
    .pixel-body::after {
      background: inherit;
      opacity: 0.85;
    }
  `;
  document.head.appendChild(style);
}
