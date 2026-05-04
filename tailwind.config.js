/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f8fafc",
          100: "#f1f5f9",
          700: "#334155",
          800: "#1f2937",
          900: "#0f172a",
          950: "#070b14"
        },
        sakura: "#f472b6",
        mint: "#2dd4bf",
        amber: "#f59e0b"
      },
      boxShadow: {
        soft: "0 18px 55px rgba(15, 23, 42, 0.12)"
      }
    }
  },
  plugins: []
};
