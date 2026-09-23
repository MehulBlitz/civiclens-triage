import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Legacy civic ramp — still used across existing components.
        civic: {
          50: "#eef6fb",
          100: "#d7ebf5",
          200: "#b2d7ea",
          300: "#7fbcd9",
          400: "#4a9cc2",
          500: "#2b80a9",
          600: "#1f668c",
          700: "#1c5271",
          800: "#1b465e",
          900: "#0f2c3f",
          950: "#081c2a"
        },
        // New ink ramp for typography.
        ink: {
          300: "#aab6c6",
          400: "#8593a8",
          500: "#5b6b82",
          700: "#24344d",
          900: "#0b1526"
        },
        // Instrument blue ramp.
        blue: {
          100: "#dbe7f5",
          200: "#b9d0ec",
          300: "#8db4e0",
          400: "#5c92cf",
          500: "#3a75b8",
          600: "#2c5c97",
          700: "#234a7b",
          800: "#1c3b63",
          900: "#16304f"
        }
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,30,55,0.04), 0 12px 28px -22px rgba(15,30,55,0.3)",
        lift: "0 2px 4px rgba(15,30,55,0.05), 0 18px 36px -22px rgba(15,30,55,0.35)"
      },
      transitionTimingFunction: {
        swift: "cubic-bezier(0.22, 1, 0.36, 1)"
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" }
        }
      },
      animation: {
        fadeUp: "fadeUp 0.35s ease-out both",
        pulseSoft: "pulseSoft 1.4s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
