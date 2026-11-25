declare module "jsfxr" {
  export type SfxrPreset =
    | "pickupCoin"
    | "laserShoot"
    | "explosion"
    | "powerUp"
    | "hitHurt"
    | "jump"
    | "blipSelect"
    | "synth"
    | "tone"
    | "click"
    | "random";

  export type SfxrSynthDef = Record<string, unknown> | string;

  export type SfxrWave = { dataURI: string };

  export const sfxr: {
    generate(preset: SfxrPreset, options?: Record<string, unknown>): SfxrSynthDef;
    toWave(synthdef: SfxrSynthDef): SfxrWave;
    toAudio(synthdef: SfxrSynthDef): HTMLAudioElement;
  };

  const jsfxr: { sfxr: typeof sfxr };
  export default jsfxr;
}
