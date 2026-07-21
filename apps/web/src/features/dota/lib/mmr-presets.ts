export interface DotaMmrPreset {
  from: string;
  id: string;
  labelKey: string;
  to: string;
}

export const DOTA_MMR_PRESETS: DotaMmrPreset[] = [
  { from: "0", id: "lt2k", labelKey: "dota.create.mmrPreset.lt2k", to: "2000" },
  { from: "2000", id: "2to3k", labelKey: "dota.create.mmrPreset.2to3k", to: "3000" },
  { from: "3000", id: "3to4k", labelKey: "dota.create.mmrPreset.3to4k", to: "4000" },
  { from: "4000", id: "4to5k", labelKey: "dota.create.mmrPreset.4to5k", to: "5000" },
  { from: "5000", id: "5kPlus", labelKey: "dota.create.mmrPreset.5kPlus", to: "18000" }
];

export function isMmrPresetActive(
  preset: DotaMmrPreset,
  from: string,
  to: string
): boolean {
  return from.trim() === preset.from && to.trim() === preset.to;
}
