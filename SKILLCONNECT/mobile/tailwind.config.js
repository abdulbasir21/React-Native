/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0D5C5A",
          dark: "#0A4846",
          deep: "#004341",
          tint: "#E6F2F1",
          "tint-border": "#D1E5E3",
        },
        amber: {
          trust: "#D97706",
          bright: "#F59E0B",
        },
        canvas: "#F7F7F6",
        surface: "#FFFFFF",
        ink: "#111827",
        muted: "#4B5563",
        placeholder: "#9CA3AF",
        hairline: "#E5E7EB",
        danger: "#BA1A1A",
        "danger-bg": "#FFDAD6",
      },
    },
  },
  plugins: [],
};
