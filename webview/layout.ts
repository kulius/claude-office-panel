export interface Point {
  x: number;
  y: number;
}

const CLUSTER_WIDTH = 240;
const CLUSTER_HEIGHT = 220;
const CLUSTER_PADDING = 20;
const BOSS_SIZE = 48;
const AGENT_SIZE = 36;

/** Calculate grid position for each session cluster */
export function getClusterPositions(
  count: number,
  containerWidth: number
): Point[] {
  if (count === 0) return [];

  const cols = Math.max(1, Math.floor(containerWidth / (CLUSTER_WIDTH + CLUSTER_PADDING)));
  const positions: Point[] = [];

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.push({
      x: CLUSTER_PADDING + col * (CLUSTER_WIDTH + CLUSTER_PADDING) + CLUSTER_WIDTH / 2,
      y: CLUSTER_PADDING + row * (CLUSTER_HEIGHT + CLUSTER_PADDING) + CLUSTER_HEIGHT / 2,
    });
  }

  return positions;
}

/** Calculate agent positions in a circle around the boss */
export function getAgentPositions(
  agentCount: number,
  centerX: number,
  centerY: number
): Point[] {
  if (agentCount === 0) return [];

  const radius = Math.min(120, 60 + agentCount * 8);
  const positions: Point[] = [];

  for (let i = 0; i < agentCount; i++) {
    const angle = (2 * Math.PI * i) / agentCount - Math.PI / 2;
    positions.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  }

  return positions;
}

export { CLUSTER_WIDTH, CLUSTER_HEIGHT, BOSS_SIZE, AGENT_SIZE };
