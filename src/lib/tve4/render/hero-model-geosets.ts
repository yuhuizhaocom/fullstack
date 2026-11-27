export interface ModelGeosetBounds {
  MinimumExtent: ArrayLike<number>;
  MaximumExtent: ArrayLike<number>;
}

export interface VisibleModelBounds {
  min: [number, number, number];
  max: [number, number, number];
}

// These geosets are ground/glow planes embedded in the imported MDX. They are
// not part of the hero and distort both the visual anchor and the health bar.
const HIDDEN_GEOSETS: Record<string, readonly number[]> = {
  m025: [0],
  m028: [12],
  m029: [0],
  m015: [0],
  m016: [0],
  m017: [13],
  m050: [7, 8, 9],
  m051: [20, 21, 23],
  m054: [3, 4, 5],
  m055: [0],
  m056: [0],
};

export function filterHeroModelGeosets<T extends { Geosets: readonly unknown[] }>(model: T, modelId: string): T {
  const hidden = HIDDEN_GEOSETS[modelId];
  if (!hidden?.length) return model;
  return {
    ...model,
    Geosets: model.Geosets.filter((_, index) => !hidden.includes(index)),
  } as T;
}

export function visibleModelBounds(
  model: { Geosets: readonly ModelGeosetBounds[] },
): VisibleModelBounds | null {
  if (!model.Geosets.length) return null;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const geoset of model.Geosets) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], geoset.MinimumExtent[axis]);
      max[axis] = Math.max(max[axis], geoset.MaximumExtent[axis]);
    }
  }
  return { min, max };
}