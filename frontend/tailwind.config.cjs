module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"] ,
  theme: {
    extend: {
      fontFamily: {
        display: ["'Space Grotesk'", "'Segoe UI'", "sans-serif"],
        body: ["'Manrope'", "'Segoe UI'", "sans-serif"]
      },
      colors: {
        ink: {
          900: "#0B1220",
          700: "#1B2B44",
          500: "#334E76"
        },
        brand: {
          900: "#0B2E8A",
          700: "#1D4ED8",
          600: "#2563EB",
          500: "#3B82F6",
          300: "#93C5FD",
          200: "#BFDBFE",
          100: "#DBEAFE"
        }
      },
      boxShadow: {
        glow: "0 18px 55px rgba(29, 78, 216, 0.25)",
        card: "0 12px 40px rgba(15, 23, 42, 0.12)"
      },
      backgroundImage: {
        "hero-gradient": "radial-gradient(circle at 15% 20%, rgba(59, 130, 246, 0.35), transparent 45%), radial-gradient(circle at 85% 10%, rgba(14, 116, 144, 0.25), transparent 40%), linear-gradient(120deg, #F8FAFF 0%, #EEF5FF 50%, #E1ECFF 100%)",
        "panel-gradient": "linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(147, 197, 253, 0.06))"
      }
    }
  },
  plugins: []
};
