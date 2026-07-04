// Shim for react/compiler-runtime
export function c(...args: any[]) { return new Proxy({}, { get() { return () => {}; } }); }
