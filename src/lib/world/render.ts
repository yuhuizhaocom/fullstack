import { terrainAt, TILE, WORLD_H, WORLD_W } from "./terrain";

export type RenderParticle = {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
};

export type RenderSnapshot = {
  players: {
    id: string;
    name: string;
    classId: string;
    level: number;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    dir: number;
    dead: boolean;
  }[];
  monsters: {
    id: string;
    name: string;
    icon: string;
    boss: boolean;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
  }[];
  drops: { id: string; x: number; y: number }[];
};

const CLASS_COLOR: Record<string, string> = {
  warrior: "#fbbf24",
  mage: "#60a5fa",
  ranger: "#34d399",
  priest: "#f472b6",
};

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  input: {
    color: string;
    name: string;
    hp: number;
    maxHp: number;
    dir: number;
    dead: boolean;
    me: boolean;
  }
): void {
  ctx.save();
  if (input.dead) ctx.globalAlpha = 0.35;

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(px, py + 13, 10, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = input.color;
  ctx.fillRect(px - 7, py - 10, 14, 19);
  ctx.fillStyle = "#f0c39b";
  ctx.fillRect(px - 5, py - 20, 10, 10);
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(px + (input.dir >= 0 ? 1 : -4), py - 16, 2.5, 2.5);

  if (input.me) {
    ctx.strokeStyle = "#fde68a";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px - 9, py - 22, 18, 33);
  }

  ctx.font = "10px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = input.me ? "#fde68a" : "#e2e8f0";
  ctx.fillText(input.name, px, py - 28);

  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(px - 13, py - 25, 26, 3);
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(px - 13, py - 25, 26 * Math.max(0, input.hp / input.maxHp), 3);

  ctx.restore();
}

export function drawWorld(
  canvas: HTMLCanvasElement,
  input: {
    width: number;
    height: number;
    cameraX: number;
    cameraY: number;
    meId: string;
    meX: number;
    meY: number;
    meName: string;
    meHp: number;
    meMaxHp: number;
    meDir: number;
    meDead: boolean;
    snapshot: RenderSnapshot | null;
    particles: RenderParticle[];
    time: number;
  }
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height, cameraX, cameraY } = input;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const scale = canvas.width / width;
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, width, height);

  const startTx = Math.max(0, Math.floor(cameraX / TILE) - 1);
  const endTx = Math.min(WORLD_W - 1, Math.ceil((cameraX + width) / TILE) + 1);
  const startTy = Math.max(0, Math.floor(cameraY / TILE) - 1);
  const endTy = Math.min(WORLD_H - 1, Math.ceil((cameraY + height) / TILE) + 1);

  ctx.fillStyle = "#102b1a";
  ctx.fillRect(0, 0, width, height);

  for (let ty = startTy; ty <= endTy; ty += 1) {
    for (let tx = startTx; tx <= endTx; tx += 1) {
      const sx = tx * TILE - cameraX;
      const sy = ty * TILE - cameraY;
      const terrain = terrainAt(tx, ty);

      if (terrain === "grass" || terrain === "flower") {
        const shade = (tx * 7 + ty * 13) % 5;
        ctx.fillStyle = shade < 2 ? "#1c4429" : shade < 4 ? "#1a3f25" : "#20492c";
        ctx.fillRect(sx, sy, TILE, TILE);
        if (terrain === "flower") {
          ctx.fillStyle = "#facc15";
          ctx.fillRect(sx + 9, sy + 13, 2, 2);
          ctx.fillRect(sx + 20, sy + 21, 2, 2);
        }
      } else if (terrain === "water") {
        ctx.fillStyle = "#1d4f7a";
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.strokeStyle = "rgba(125,211,252,0.35)";
        ctx.lineWidth = 1;
        const wave = Math.sin((input.time / 600) + tx * 0.7 + ty * 0.4) * 3;
        ctx.beginPath();
        ctx.moveTo(sx + 5, sy + 16 + wave);
        ctx.lineTo(sx + 26, sy + 16 + wave);
        ctx.stroke();
      } else if (terrain === "tree") {
        ctx.fillStyle = "#173c23";
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = "#5b3a1e";
        ctx.fillRect(sx + 14, sy + 18, 4, 12);
        ctx.fillStyle = "#2f7a3f";
        ctx.beginPath();
        ctx.moveTo(sx + 16, sy + 3);
        ctx.lineTo(sx + 6, sy + 20);
        ctx.lineTo(sx + 26, sy + 20);
        ctx.closePath();
        ctx.fill();
      } else if (terrain === "rock") {
        ctx.fillStyle = "#173c23";
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = "#64748b";
        ctx.beginPath();
        ctx.arc(sx + 16, sy + 18, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#94a3b8";
        ctx.beginPath();
        ctx.arc(sx + 13, sy + 15, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const snapshot = input.snapshot;

  if (snapshot) {
    for (const drop of snapshot.drops) {
      const px = drop.x - cameraX;
      const py = drop.y - cameraY;
      if (px < -30 || py < -30 || px > width + 30 || py > height + 30) continue;
      const bob = Math.sin(input.time / 300 + drop.x) * 2;
      ctx.font = "18px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🧪", px, py + bob);
    }

    for (const monster of snapshot.monsters) {
      const px = monster.x - cameraX;
      const py = monster.y - cameraY;
      if (px < -50 || py < -50 || px > width + 50 || py > height + 50) continue;

      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(px, py + 14, monster.boss ? 20 : 12, monster.boss ? 8 : 5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = `${monster.boss ? 44 : 30}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(monster.icon, px, py);

      ctx.font = "10px ui-monospace, Menlo, monospace";
      ctx.fillStyle = monster.boss ? "#f0abfc" : "#fca5a5";
      ctx.fillText(monster.name, px, py - (monster.boss ? 34 : 24));

      const barWidth = monster.boss ? 56 : 34;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(px - barWidth / 2, py - (monster.boss ? 28 : 19), barWidth, 3);
      ctx.fillStyle = monster.boss ? "#e879f9" : "#ef4444";
      ctx.fillRect(
        px - barWidth / 2,
        py - (monster.boss ? 28 : 19),
        barWidth * Math.max(0, monster.hp / monster.maxHp),
        3
      );
    }

    for (const player of snapshot.players) {
      if (player.id === input.meId) continue;
      drawPlayer(ctx, player.x - cameraX, player.y - cameraY, {
        color: CLASS_COLOR[player.classId] ?? "#cbd5e1",
        name: `${player.name} Lv.${player.level}`,
        hp: player.hp,
        maxHp: player.maxHp,
        dir: player.dir,
        dead: player.dead,
        me: false,
      });
    }
  }

  drawPlayer(ctx, input.meX - cameraX, input.meY - cameraY, {
    color: CLASS_COLOR[snapshot?.players.find((p) => p.id === input.meId)?.classId ?? "warrior"] ?? "#fbbf24",
    name: input.meName,
    hp: input.meHp,
    maxHp: input.meMaxHp,
    dir: input.meDir,
    dead: input.meDead,
    me: true,
  });

  for (const particle of input.particles) {
    const px = particle.x - cameraX;
    const py = particle.y - cameraY;
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.font = "bold 13px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = particle.color;
    ctx.fillText(particle.text, px, py);
    ctx.globalAlpha = 1;
  }
}
