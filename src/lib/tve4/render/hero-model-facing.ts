export function shouldFlipHeroModel(facing: number): boolean {
  return Math.cos(facing) < -0.08;
}

export function heroModelOrientation(facing: number): { flipX: boolean; yaw: number } {
  const x = Math.cos(facing);
  const y = Math.sin(facing);
  if (Math.abs(y) > Math.abs(x)) return { flipX: false, yaw: facing };
  return { flipX: x < -0.08, yaw: 0 };
}
