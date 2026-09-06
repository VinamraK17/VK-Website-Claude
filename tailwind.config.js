/** Mirrors the config that used to be inlined on every page for the Tailwind
 *  play CDN. Content globs must include the JS/TS that emits class names as
 *  string literals, or those utilities get tree-shaken out of the build. */
module.exports = {
  content: [
    './pages/**/*.html',
    './public/**/*.js',
    './server.ts',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: { accent: '#d4af37', surface: '#0d0d0f' },
    },
  },
};
