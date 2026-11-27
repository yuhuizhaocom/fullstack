export function shouldFlipHeroModel(facing: number): boolean {
  return Math.cos(facing) < -0.08;
}
