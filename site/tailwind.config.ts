import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        tide: {
          50: "#f2f7f7", 100: "#dcecec", 200: "#bbd9da", 300: "#8fbec2",
          400: "#5f9ea5", 500: "#40818b", 600: "#316772", 700: "#2a535d",
          800: "#26454e", 900: "#233a42", 950: "#0d2129",
        },
        saffron: {
          50: "#fff8ed", 100: "#ffefd4", 200: "#ffdba8", 300: "#ffc071",
          400: "#ff9d38", 500: "#fe7f11", 600: "#ef6407", 700: "#c64b08",
          800: "#9e3b10", 900: "#7f3210",
        },
        ink: {
          300: "#aab6c6", 400: "#8593a8", 500: "#5b6b82", 700: "#24344d", 900: "#0b1526",
        },
      },
      minHeight: { touch: "2.75rem" },
      boxShadow: {
        card: "0 1px 2px rgba(13,33,41,0.06), 0 14px 30px -22px rgba(13,33,41,0.35)",
        lift: "0 2px 6px rgba(13,33,41,0.08), 0 22px 44px -22px rgba(13,33,41,0.4)",
      },
      transitionTimingFunction: { swift: "cubic-bezier(0.22, 1, 0.36, 1)" },
      keyframes: {
        riseIn: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        marquee: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
        tidebob: { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
      },
      animation: {
        riseIn: "riseIn 0.5s cubic-bezier(0.22,1,0.36,1) both",
        marquee: "marquee 28s linear infinite",
        tidebob: "tidebob 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
