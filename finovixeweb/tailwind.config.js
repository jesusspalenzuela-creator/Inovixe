// tailwind.config.js
module.exports = {
  content: [
    "./src/renderer/**/*.{html,js}"
  ],
  theme: {
    extend: {
      fontSize: {
        'base': '15px',        // Tamaño base más equilibrado
      }
    },
  },
  plugins: [],
}