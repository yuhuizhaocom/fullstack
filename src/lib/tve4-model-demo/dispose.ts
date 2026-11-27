export function disposeRenderer(renderer: { destroy(): void } | null): void {
  if (!renderer) return;
  try {
    renderer.destroy();
  } catch {
    // war3-model 4.0.1 may destroy optional environment shaders before initialization.
  }
}
