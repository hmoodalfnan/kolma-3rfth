import coreWebVitals from 'eslint-config-next/core-web-vitals';

export default [
  ...coreWebVitals,
  {
    rules: {
      // Raw HTML injection is banned repo-wide; see docs/SECURITY.md.
      'react/no-danger': 'error',

      // React Compiler flags every setState inside an effect. Most of ours read
      // browser-only state (localStorage, navigator.onLine, window.location) after
      // mount, which is exactly how you avoid a hydration mismatch in the App
      // Router — there is no server-render-safe alternative. Kept as a warning so
      // genuinely new instances are still visible in review.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'public/sw.js'],
  },
];
