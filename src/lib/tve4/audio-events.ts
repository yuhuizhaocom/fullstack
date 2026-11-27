import type { Tve4SfxKind } from "./audio";

export interface Tve4AudioEventState {
  projectiles: ReadonlyArray<{ id: number }>;
  heroes: ReadonlyArray<{
    id: number;
    alive: boolean;
    hp: number;
    cd: number;
    interval: number;
  }>;
  buildings: ReadonlyArray<{ id: number; alive: boolean }>;
}

export function collectTve4AudioEvents(
  previous: Tve4AudioEventState | null,
  next: Tve4AudioEventState,
): Tve4SfxKind[] {
  if (!previous) return [];
  const events: Tve4SfxKind[] = [];
  const previousProjectiles = new Set(previous.projectiles.map((projectile) => projectile.id));
  const previousHeroes = new Map(previous.heroes.map((hero) => [hero.id, hero]));
  const previousBuildings = new Map(previous.buildings.map((building) => [building.id, building]));
  let attacked = false;
  let hit = false;
  let destroyed = false;
  let died = false;

  if (next.projectiles.some((projectile) => !previousProjectiles.has(projectile.id))) attacked = true;

  for (const hero of next.heroes) {
    const before = previousHeroes.get(hero.id);
    if (!before) continue;
    const wasAttacking = before.alive && before.cd > before.interval * 0.45;
    const isAttacking = hero.alive && hero.cd > hero.interval * 0.45;
    if (!wasAttacking && isAttacking) attacked = true;
    if (hero.hp < before.hp && hero.alive) hit = true;
    if (before.alive && !hero.alive) died = true;
  }

  for (const building of next.buildings) {
    const before = previousBuildings.get(building.id);
    if (before?.alive && !building.alive) destroyed = true;
  }

  if (attacked) events.push("attack");
  if (hit) events.push("hit");
  if (destroyed) events.push("destroy");
  if (died) events.push("death");
  return events;
}
