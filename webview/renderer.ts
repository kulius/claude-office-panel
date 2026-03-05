import type { BossState, PanelSession, BubbleContent } from "./types";

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

const STATE_LABELS: Record<string, string> = {
  idle: "閒置 idle",
  phone_ringing: "來電 ring",
  on_phone: "通話 call",
  receiving: "接收 recv",
  working: "工作中 work",
  delegating: "委派 delegate",
  waiting_permission: "等待授權 wait",
  reviewing: "審查 review",
  completing: "完成 done",
  thinking: "思考 think",
  waiting: "等待 wait",
  completed: "完成 done",
  arriving: "進入 arrive",
  leaving: "離開 leave",
  in_elevator: "進入 arrive",
  reporting: "回報 report",
  walking_to_desk: "就位 walk",
};

const SKIN = "#fdd8b5";
const HAIR_COLORS = ["#4a3728", "#2d1b0e", "#8b6914", "#c0392b", "#1a1a2e", "#5b3a29", "#e67e22", "#7f8c8d"];
const PANTS_COLORS = ["#2c3e50", "#34495e", "#1a237e", "#4a148c", "#263238"];

const ACTIVE_STATES = new Set(["working", "thinking", "reporting", "walking_to_desk"]);

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "\u2026" : text;
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

function createPixelPerson(
  isBoss: boolean,
  bodyColor: string,
  hairColor: string,
  pantsColor: string,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "pixel-person";

  const hair = document.createElement("div");
  hair.className = "pixel-hair";
  hair.style.backgroundColor = hairColor;
  wrap.appendChild(hair);

  const head = document.createElement("div");
  head.className = "pixel-head";
  head.style.backgroundColor = SKIN;
  wrap.appendChild(head);

  const body = document.createElement("div");
  body.className = "pixel-body";
  body.style.backgroundColor = bodyColor;
  wrap.appendChild(body);

  if (isBoss) {
    const tie = document.createElement("div");
    tie.className = "pixel-tie";
    tie.style.backgroundColor = "#e74c3c";
    body.appendChild(tie);
  }

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

export function render(
  container: HTMLElement,
  sessions: PanelSession[],
  connected: boolean,
): void {
  container.innerHTML = "";

  if (!connected) {
    const msg = document.createElement("div");
    msg.className = "empty-message";
    msg.innerHTML =
      '<div class="empty-icon">\uD83D\uDD0C</div>' +
      "<p>Scanning for Claude Code sessions\u2026</p>" +
      '<p class="empty-hint">Sessions in <code>~/.claude/projects/</code></p>';
    container.appendChild(msg);
    return;
  }

  if (sessions.length === 0) {
    const msg = document.createElement("div");
    msg.className = "empty-message";
    msg.innerHTML =
      '<div class="empty-icon">\uD83C\uDFE2</div>' +
      "<p>No active sessions</p>" +
      '<p class="empty-hint">Open a terminal and run <code>claude</code> to see agents appear</p>';
    container.appendChild(msg);
    return;
  }

  ensureArmStyle();

  for (const session of sessions) {
    const bossState = session.boss.state;
    const bodyColor = BOSS_BODY_COLORS[bossState] ?? "#4a5568";
    const isActive = ACTIVE_STATES.has(bossState);

    const cluster = document.createElement("div");
    cluster.className = "cluster";

    // 1) Project name (top)
    const nameLabel = document.createElement("div");
    nameLabel.className = "cluster-name";
    nameLabel.textContent = truncate(session.projectName, 20);
    cluster.appendChild(nameLabel);

    // 2) State badge
    const badge = document.createElement("div");
    badge.className = "state-badge";
    badge.textContent = STATE_LABELS[bossState] ?? bossState;
    cluster.appendChild(badge);

    // 3) Boss character
    const bossEl = document.createElement("div");
    bossEl.className = `character boss state-${bossState} ${isActive ? "working" : ""}`;
    bossEl.title = `${session.projectName} -- ${bossState}`;
    bossEl.appendChild(createPixelPerson(true, bodyColor, "#2d1b0e", "#2c3e50"));

    if (session.boss.bubble) {
      bossEl.appendChild(createBubbleEl(session.boss.bubble));
    }
    cluster.appendChild(bossEl);

    // 4) Agents row (horizontal line below boss)
    if (session.agents.length > 0) {
      const agentRow = document.createElement("div");
      agentRow.className = "agent-row";

      for (const agent of session.agents) {
        const h = hashStr(agent.id);
        const agentHair = HAIR_COLORS[h % HAIR_COLORS.length];
        const agentPants = PANTS_COLORS[h % PANTS_COLORS.length];
        const agentActive = ACTIVE_STATES.has(agent.state);

        const agentWrap = document.createElement("div");
        agentWrap.className = "agent-wrap";

        const agentEl = document.createElement("div");
        agentEl.className = `character agent ${agentActive ? "working" : ""} ${
          agent.state === "leaving" || agent.state === "completed" ? "leaving" : ""
        } ${agent.state === "arriving" || agent.state === "in_elevator" ? "arriving" : ""}`;
        agentEl.title = `${agent.name ?? agent.id.slice(0, 8)} -- ${agent.state}`;
        agentEl.appendChild(createPixelPerson(false, agent.color, agentHair, agentPants));

        if (agent.bubble) {
          agentEl.appendChild(createBubbleEl(agent.bubble));
        }

        agentWrap.appendChild(agentEl);

        const agentLabel = document.createElement("div");
        agentLabel.className = "agent-label";
        agentLabel.textContent = truncate(agent.name ?? "Agent", 10);
        agentWrap.appendChild(agentLabel);

        agentRow.appendChild(agentWrap);
      }

      cluster.appendChild(agentRow);
    }

    container.appendChild(cluster);
  }
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
