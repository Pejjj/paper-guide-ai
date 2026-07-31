import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17231f",
        paper: "#f7f4ed",
        moss: "#315c4a",
        sage: "#dce8df",
        coral: "#e97555",
      },
      boxShadow: {
        soft: "0 18px 50px rgba(23, 35, 31, 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;

