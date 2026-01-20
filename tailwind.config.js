/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        minecraft: {
          green: '#55FF55',
          dark: '#1D1D1D',
          dirt: '#79553A',
          stone: '#7E7E7E',
          red: '#FF5555',
        }
      },
      fontFamily: {
        minecraft: ['"Minecraft"', 'monospace'],
      }
    },
  },
  plugins: [],
}
