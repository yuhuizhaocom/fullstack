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

const ISO_HALF_W = 32;
const ISO_HALF_H = 16;

const CLASS_COLOR: Record<string, string> = {
  warrior: "#fbbf24",
  mage: "#60a5fa",
  ranger: "#34d399",
  priest: "#f472b6",
};

function toScreen(wx: number, wy: number, camX: number, camY: number) {
  return { x: wx - wy - camX, y: (wx + wy) / 2 - camY };
}

function diamondPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - halfH);
  ctx.lineTo(cx + halfW, cy);
  ctx.lineTo(cx, cy + halfH);
  ctx.lineTo(cx - halfW, cy);
  ctx.closePath();
}

function drawGroundTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  terrain: string,
  tx: number,
  ty: number,
  time: number
): void {
  const shade = (tx * 7 + ty * 13) % 3;
  const grass = ["#1b4227", "#1d472b", "#1a3d24"][shade];

  diamondPath(ctx, x, y, ISO_HALF_W, ISO_HALF_H);
  ctx.fillStyle = terrain === "water" ? "#1b4a72" : grass;
  ctx.fill();

  if (terrain === "flower") {
    ctx.fillStyle = "#facc15";
    ctx.fillRect(x - 7, y - 3, 2, 2);
    ctx.fillRect(x + 6, y + 3, 2, 2);
  } else if (terrain === "water") {
    const wave = Math.sin(time / 600 + tx * 0.7 + ty * 0.4) * 4;
    ctx.strokeStyle = "rgba(125,211,252,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 16, y + wave);
    ctx.lineTo(x + 16, y + wave);
    ctx.stroke();
  }
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 17, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#5b3a1e";
  ctx.fillRect(x - 3, y - 30, 6, 30);

  ctx.fillStyle = "#256b38";
  ctx.beginPath();
  ctx.moveTo(x, y - 68);
  ctx.lineTo(x - 22, y - 36);
  ctx.lineTo(x + 22, y - 36);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#2f7a3f";
  ctx.beginPath();
  ctx.moveTo(x, y - 55);
  ctx.lineTo(x - 26, y - 24);
  ctx.lineTo(x + 26, y - 24);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#3c9350";
  ctx.beginPath();
  ctx.moveTo(x, y - 43);
  ctx.lineTo(x - 20, y - 15);
  ctx.lineTo(x + 20, y - 15);
  ctx.closePath();
  ctx.fill();
}

function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#4b5563";
  ctx.beginPath();
  ctx.ellipse(x, y - 8, 16, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#6b7280";
  ctx.beginPath();
  ctx.ellipse(x - 3, y - 13, 12, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#9ca3af";
  ctx.beginPath();
  ctx.ellipse(x - 6, y - 17, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayerSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
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

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 14, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#334155";
  ctx.fillRect(x - 7, y - 11, 5.5, 11);
  ctx.fillRect(x + 1.5, y - 11, 5.5, 11);

  ctx.fillStyle = input.color;
  ctx.fillRect(x - 9, y - 30, 18, 20);

  ctx.fillStyle = "#f0c39b";
  ctx.fillRect(x - 7, y - 43, 14, 13);

  ctx.fillStyle = "#1f2937";
  ctx.fillRect(x + (input.dir >= 0 ? 3 : -5), y - 38, 2.5, 2.5);

  if (input.me) {
    ctx.strokeStyle = "#fde68a";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 11, y - 45, 22, 46);
  }

  ctx.font = "10px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = input.me ? "#fde68a" : "#e2e8f0";
  ctx.fillText(input.name, x, y - 52);

  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(x - 14, y - 49, 28, 3);
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(x - 14, y - 49, 28 * Math.max(0, input.hp / input.maxHp), 3);

  ctx.restore();
}

function drawMonster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  monster: { icon: string; name: string; boss: boolean; hp: number; maxHp: number }
): void {
  const scale = monster.boss ? 1.5 : 1;

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 13 * scale, 6 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  // 底座光晕，让怪物在等距地面上更立体
  ctx.fillStyle = monster.boss ? "rgba(232,121,249,0.22)" : "rgba(248,113,113,0.18)";
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 17 * scale, 8.5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = `${monster.boss ? 44 : 30}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(monster.icon, x, y);

  ctx.font = "10px ui-monospace, Menlo, monospace";
  ctx.fillStyle = monster.boss ? "#f0abfc" : "#fca5a5";
  ctx.fillText(monster.name, x, y - (monster.boss ? 42 : 32));

  const barWidth = monster.boss ? 56 : 34;
  const barY = y - (monster.boss ? 37 : 27);
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(x - barWidth / 2, barY, barWidth, 3);
  ctx.fillStyle = monster.boss ? "#e879f9" : "#ef4444";
  ctx.fillRect(
    x - barWidth / 2,
    barY,
    barWidth * Math.max(0, monster.hp / monster.maxHp),
    3
  );
}

export function drawWorld(
  canvas: HTMLCanvasElement,
  input: {
    width: number;
    height: number;
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

  const { width, height } = input;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const scale = canvas.width / width;
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, width, height);

  // 2.5D 等距相机：以自己为中心，并限制在地图菱形范围内
  const meIsoX = input.meX - input.meY;
  const meIsoY = (input.meX + input.meY) / 2;
  const isoMinX = -WORLD_H * TILE;
  const isoMaxX = WORLD_W * TILE;
  const isoMinY = 0;
  const isoMaxY = ((WORLD_W + WORLD_H) * TILE) / 2;
  const camX = Math.max(isoMinX, Math.min(isoMaxX - width, meIsoX - width / 2));
  const camY = Math.max(isoMinY, Math.min(isoMaxY - height, meIsoY - height / 2));

  ctx.fillStyle = "#08160d";
  ctx.fillRect(0, 0, width, height);

  // 屏幕四角反投影到世界坐标，得到需要绘制的瓦片范围
  const unproject = (sx: number, sy: number) => {
    const isoX = sx + camX;
    const isoY = sy + camY;
    return { x: isoY + isoX / 2, y: isoY - isoX / 2 };
  };
  const corners = [
    unproject(0, 0),
    unproject(width, 0),
    unproject(0, height),
    unproject(width, height),
  ];
  const minTx = Math.max(
    0,
    Math.floor(Math.min(...corners.map((corner) => corner.x)) / TILE) - 2
  );
  const maxTx = Math.min(
    WORLD_W - 1,
    Math.ceil(Math.max(...corners.map((corner) => corner.x)) / TILE) + 2
  );
  const minTy = Math.max(
    0,
    Math.floor(Math.min(...corners.map((corner) => corner.y)) / TILE) - 2
  );
  const maxTy = Math.min(
    WORLD_H - 1,
    Math.ceil(Math.max(...corners.map((corner) => corner.y)) / TILE) + 2
  );

  type Entity = { depth: number; draw: () => void };
  const entities: Entity[] = [];

  // 地面
  for (let ty = minTy; ty <= maxTy; ty += 1) {
    for (let tx = minTx; tx <= maxTx; tx += 1) {
      const wx = tx * TILE + TILE / 2;
      const wy = ty * TILE + TILE / 2;
      const screen = toScreen(wx, wy, camX, camY);
      if (
        screen.x < -ISO_HALF_W * 2 ||
        screen.x > width + ISO_HALF_W * 2 ||
        screen.y < -ISO_HALF_H * 3 ||
        screen.y > height + ISO_HALF_H * 4
      ) {
        continue;
      }

      const terrain = terrainAt(tx, ty);
      drawGroundTile(ctx, screen.x, screen.y, terrain, tx, ty, input.time);

      if (terrain === "tree" || terrain === "rock") {
        entities.push({
          depth: wx + wy,
          draw: () => {
            if (terrain === "tree") drawTree(ctx, screen.x, screen.y);
            else drawRock(ctx, screen.x, screen.y);
          },
        });
      }
    }
  }

  const snapshot = input.snapshot;

  if (snapshot) {
    for (const drop of snapshot.drops) {
      const screen = toScreen(drop.x, drop.y, camX, camY);
      if (
        screen.x < -40 ||
        screen.y < -40 ||
        screen.x > width + 40 ||
        screen.y > height + 40
      ) {
        continue;
      }
      entities.push({
        depth: drop.x + drop.y,
        draw: () => {
          const bob = Math.sin(input.time / 300 + drop.x) * 3;
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          ctx.beginPath();
          ctx.ellipse(screen.x, screen.y + 2, 10, 4.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(250,204,21,0.18)";
          ctx.beginPath();
          ctx.ellipse(screen.x, screen.y + 1, 13, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = "18px serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "alphabetic";
          ctx.fillText("🧪", screen.x, screen.y + bob);
        },
      });
    }

    for (const monster of snapshot.monsters) {
      const screen = toScreen(monster.x, monster.y, camX, camY);
      if (
        screen.x < -60 ||
        screen.y < -60 ||
        screen.x > width + 60 ||
        screen.y > height + 60
      ) {
        continue;
      }
      entities.push({
        depth: monster.x + monster.y,
        draw: () => drawMonster(ctx, screen.x, screen.y, monster),
      });
    }

    for (const player of snapshot.players) {
      if (player.id === input.meId) continue;
      const screen = toScreen(player.x, player.y, camX, camY);
      if (
        screen.x < -60 ||
        screen.y < -60 ||
        screen.x > width + 60 ||
        screen.y > height + 60
      ) {
        continue;
      }
      entities.push({
        depth: player.x + player.y,
        draw: () =>
          drawPlayerSprite(ctx, screen.x, screen.y, {
            color: CLASS_COLOR[player.classId] ?? "#cbd5e1",
            name: `${player.name} Lv.${player.level}`,
            hp: player.hp,
            maxHp: player.maxHp,
            dir: player.dir,
            dead: player.dead,
            me: false,
          }),
      });
    }
  }

  const meScreen = toScreen(input.meX, input.meY, camX, camY);
  entities.push({
    depth: input.meX + input.meY,
    draw: () =>
      drawPlayerSprite(ctx, meScreen.x, meScreen.y, {
        color:
          CLASS_COLOR[
            snapshot?.players.find((player) => player.id === input.meId)?.classId ??
              "warrior"
          ] ?? "#fbbf24",
        name: input.meName,
        hp: input.meHp,
        maxHp: input.meMaxHp,
        dir: input.meDir,
        dead: input.meDead,
        me: true,
      }),
  });

  entities.sort((a, b) => a.depth - b.depth);
  for (const entity of entities) entity.draw();

  for (const particle of input.particles) {
    const screen = toScreen(particle.x, particle.y, camX, camY);
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.font = "bold 13px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = particle.color;
    ctx.fillText(particle.text, screen.x, screen.y);
    ctx.globalAlpha = 1;
  }
}
