// Shim for bun:bundle feature flags
// All features default to false (code paths DCE'd out at build time)
export function feature(name: string): boolean {
  return false;
}

// MACRO build-time macro replacement
export const MACRO = {
  VERSION: '1.0.0-snapshot',
};
