import type { ThemeKey } from "@/lib/types";

export const themeCatalog: Record<
  ThemeKey,
  {
    label: string;
    summary: string;
    accent: string;
    glow: string;
    surface: string;
    className: string;
  }
> = {
  night: {
    label: "Night",
    summary: "Deep indigo glow, glass surfaces, and a cool neon edge.",
    accent: "#b48cff",
    glow: "#69d0ff",
    surface: "#120f1d",
    className: "theme-night",
  },
  cherry: {
    label: "Cherry Blossom",
    summary: "Pink haze, soft petals, and a warm nighttime shimmer.",
    accent: "#ff86a5",
    glow: "#ffd0df",
    surface: "#2a1321",
    className: "theme-cherry",
  },
  halloween: {
    label: "Halloween",
    summary: "Amber embers, dark chocolate panels, and pumpkin sparks.",
    accent: "#ff9f43",
    glow: "#ffe28f",
    surface: "#231507",
    className: "theme-halloween",
  },
  valentine: {
    label: "Valentine",
    summary: "Raspberry gloss, rose light, and plush romantic contrast.",
    accent: "#ff7bb6",
    glow: "#ffd6e9",
    surface: "#301126",
    className: "theme-valentine",
  },
};

export const themeKeys = Object.keys(themeCatalog) as ThemeKey[];

export function normalizeThemeKey(value: string | null | undefined): ThemeKey {
  return value && value in themeCatalog ? (value as ThemeKey) : "night";
}
