/**
 * ServiceFlow design tokens — the one visual vocabulary shared by the web
 * (Tailwind theme) and mobile (StyleSheet) apps. Deliberately restrained:
 * one brand colour, one accent, neutral greys, semantic states.
 */
export const colors = {
  brand: {
    50: "#ECF7F2",
    100: "#D2EDE1",
    200: "#A6DBC4",
    300: "#6FC2A0",
    400: "#3AA37B",
    500: "#1B8660",
    600: "#0E6B4C",
    700: "#0B563E",
    800: "#0A4432",
    900: "#08372A",
  },
  accent: {
    400: "#F2C14E",
    500: "#E0A526",
    600: "#B9841A",
  },
  neutral: {
    0: "#FFFFFF",
    50: "#F7F8F8",
    100: "#EEF0F0",
    200: "#DDE1E1",
    300: "#C3C9C9",
    400: "#9AA3A3",
    500: "#6E7878",
    600: "#525B5B",
    700: "#3B4242",
    800: "#252A2A",
    900: "#151818",
  },
  success: "#1B8660",
  warning: "#B9841A",
  danger: "#C23B32",
  info: "#2F6FB0",
} as const;

export const radii = { sm: 6, md: 10, lg: 14, full: 9999 } as const;

export const spacing = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;

export const fontSizes = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30, "4xl": 36 } as const;

export const fontFamily = {
  sans: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
} as const;

export const brand = {
  name: "ServiceFlow",
  tagline: "Trusted service professionals, booked in minutes.",
} as const;
