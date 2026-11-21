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
          DEFAULT: "#0D16A8",
          dark: "#080E7D",
          deep: "#05095A",
          bright: "#2432D9",
          tint: "#EAEFFF",
          "tint-border": "#CFD8FF",
        },
        sky: {
          accent: "#44B3E8",
          tint: "#E0F4FD",
        },
        location: {
          green: "#38B420",
          dark: "#2A8F17",
          tint: "#E9F9E5",
        },
        amber: {
          trust: "#F59E0B",
          bright: "#FBB03B",
          tint: "#FEF3C7",
        },
        canvas: "#F2F6FC",
        surface: "#FFFFFF",
        ink: "#111827",
        muted: "#64748B",
        placeholder: "#94A3B8",
        hairline: "#E2E8F0",
        danger: "#DC2626",
        "danger-bg": "#FEE2E2",
      },
    },
  },
  plugins: [],
};
