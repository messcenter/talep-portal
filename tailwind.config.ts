import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: "#f9f9fe", tonal: "#F8FAFC", container: "#ededf3" },
        "border-subtle": "#E2E8F0",
        primary: { DEFAULT: "#0F4C81", fg: "#ffffff" },
        secondary: { DEFAULT: "#546E7A", fg: "#ffffff" },
        "on-surface": { DEFAULT: "#191c1f", variant: "#42474f" },
        status: {
          yeni: "#1976D2",
          netlestiriliyor: "#F57C00",
          kabul: "#2E7D32",
          ret: "#C62828",
        },
        danger: { DEFAULT: "#C62828", fg: "#ffffff" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: { DEFAULT: "0.25rem", lg: "0.5rem", xl: "0.75rem" },
      maxWidth: { container: "1280px" },
    },
  },
  plugins: [],
} satisfies Config;
