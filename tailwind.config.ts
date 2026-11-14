import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        charcoal: "#121820",
        slate2: "#1C2630",
        phoenix: { DEFAULT: "#E96A32", dark: "#C9541F", soft: "#FCEEE6" },
        amber2: "#F3A34A",
        offwhite: "#F7F8FA",
        line: "#E3E6EA",
      },
      fontFamily: { sans: ["Cairo Variable", "Cairo", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
