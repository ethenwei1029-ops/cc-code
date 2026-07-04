// Entry point wrapper: defines MACRO before importing the real CLI
(globalThis as any).MACRO = {
  VERSION: '1.0.0-snapshot',
};

// Re-export everything from the real entry point
import './src/entrypoints/cli.tsx';
