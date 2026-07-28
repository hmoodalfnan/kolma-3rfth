/**
 * Public Supabase config — safe to import from client components.
 *
 * Supabase's own Vercel integration provisions NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 * (the newer sb_publishable_* keys), while the docs and most examples use
 * NEXT_PUBLIC_SUPABASE_ANON_KEY. Accepting either means a working deployment does
 * not hinge on which page the values were copied from.
 *
 * Each name is written as a full literal on purpose: Next inlines NEXT_PUBLIC_*
 * at build time by textual match, so a computed lookup would silently be
 * undefined in the browser.
 *
 * Nothing secret belongs in this file — see env.server.js.
 */

export const PUBLIC_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ||
  '';

export const PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY ||
  '';

export const PUBLIC_NAMES = Object.freeze({
  url: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PROJECT_URL'],
  publicKey: [
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY',
  ],
});
