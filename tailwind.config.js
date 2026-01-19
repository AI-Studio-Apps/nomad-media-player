/** @type {import('tailwindcss').Config} */
// Since we are using the Tailwind CDN, we attach the config to the global object.
// Developers can customize the theme, colors, and plugins here.

window.tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Custom color palette for Nomad Media Player (Zinc Theme)
        background: '#18181b', // Zinc 900
        surface: '#1f2227',    // Zinc 800 = #27272a
        primary: '#3b82f6',    // Blue 500
        secondary: '#71717a',  // Zinc 500
      }
    }
  },
  plugins: [],
}