// `server-only` throws by design when loaded outside a server component. Route
// handlers are server code, but Vitest runs them in jsdom, so it is aliased to
// this no-op for tests. The real guard still protects the production bundle —
// tests/security/bundle-safety.test.js asserts the import is present in
// lib/supabase/server.js.
export {};
