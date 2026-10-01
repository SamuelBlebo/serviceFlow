import { designTokens } from "@serviceflow/shared";

/** Mobile theme — the same shared design tokens the web Tailwind theme mirrors. */
export const colors = {
  brand: designTokens.colors.brand[600],
  brandDark: designTokens.colors.brand[700],
  brandSoft: designTokens.colors.brand[50],
  accent: designTokens.colors.accent[500],
  text: designTokens.colors.neutral[900],
  textMuted: designTokens.colors.neutral[600],
  textSubtle: designTokens.colors.neutral[500],
  border: designTokens.colors.neutral[200],
  surface: designTokens.colors.neutral[0],
  surfaceMuted: designTokens.colors.neutral[50],
  danger: designTokens.colors.danger,
  warning: designTokens.colors.warning,
} as const;

export const space = designTokens.spacing;
export const radius = designTokens.radii;
export const fontSize = designTokens.fontSizes;
