/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ethnoir: {
          black: '#111111',
          charcoal: '#2A2A2A',
          gray: '#5F5F5F',
          muted: '#8E8E8E',
          light: '#F8F8F8',
          border: '#E6E6E6',
          white: '#FFFFFF',
        }
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Poppins', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      letterSpacing: {
        luxury: '0.2em',
        editorial: '0.12em',
      }
    },
  },
  plugins: [],
}
