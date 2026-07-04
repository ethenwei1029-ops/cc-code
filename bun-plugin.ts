/**
 * Bun plugin: replaces `bun:bundle` with a shim where feature() = false.
 * Also defines MACRO.VERSION and maps `color-diff-napi` to the pure-TS
 * implementation (the npm stub exports empty objects, not real classes).
 */
export default {
  name: 'cc-code-shims',
  setup(build) {
    // bun:bundle → shim
    build.onResolve({ filter: /^bun:bundle$/ }, () => ({
      path: './shims/bun-bundle.ts',
    }));

    // color-diff-napi → pure-TS port (node_modules stub is a placeholder)
    build.onResolve({ filter: /^color-diff-napi$/ }, () => ({
      path: './src/native-ts/color-diff/index.ts',
    }));

    // Define MACRO.VERSION
    build.define('MACRO.VERSION', '"1.0.0-snapshot"');
  },
};
