/**
 * Auto-fix: runs bun build, parses ALL errors, creates missing files/packages.
 * Repeats until build succeeds or no more fixable errors.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();
const BUN = `${process.env.HOME}/.bun/bin/bun`;

function run() {
  try {
    const out = execSync(
      `${BUN} build src/entrypoints/cli.tsx --compile --outfile=cc-code --target=bun --plugin=./bun-plugin.ts 2>&1`,
      { cwd: ROOT, timeout: 120000, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );
    return { success: true, output: out };
  } catch (e) {
    return { success: false, output: e.stdout || e.stderr || e.message };
  }
}

function parseErrors(output) {
  const errors = [];
  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // Pattern: Could not resolve: "path" at file:line:col
    const m = lines[i].match(/Could not resolve:\s*"([^"]+)"/);
    if (m) {
      const importPath = m[1];
      // Find the "at" line
      const atMatch = lines[i + 1]?.match(/at (.+):(\d+):(\d+)/) || lines[i]?.match(/at (.+):(\d+):(\d+)/);
      const sourceFile = atMatch?.[1]?.replace('file://', '');
      errors.push({ importPath, sourceFile });
    }
  }
  return errors;
}

function fixError(err) {
  const { importPath, sourceFile } = err;

  // Skip bun:bundle (handled by plugin)
  if (importPath === 'bun:bundle') return false;

  // npm package (no ./ prefix)
  if (!importPath.startsWith('.') && !importPath.startsWith('src/')) {
    // Create node_modules shim
    let pkgPath = importPath;
    // Handle subpath imports like @scope/pkg/subpath
    const parts = importPath.split('/');
    let pkgDir;
    if (importPath.startsWith('@')) {
      pkgDir = parts.slice(0, 2).join('/');
    } else {
      pkgDir = parts[0];
    }

    const fullPath = join(ROOT, 'node_modules', pkgDir);
    if (existsSync(fullPath)) return false; // already exists

    mkdirSync(fullPath, { recursive: true });
    writeFileSync(join(fullPath, 'index.js'), 'export default {};\n');
    return `Created npm shim: ${pkgDir}`;
  }

  // Internal file (./ or src/ prefix)
  let resolved;
  if (importPath.startsWith('src/')) {
    resolved = join(ROOT, importPath);
  } else if (sourceFile) {
    resolved = resolve(dirname(sourceFile), importPath);
  } else {
    return false;
  }

  // Handle .js extension → .ts
  let filePath = resolved.replace(/\.js$/, '.ts').replace(/\.jsx$/, '.tsx');

  // Handle non-TS files (.md, .txt, .json, etc.)
  if (/\.(md|txt|json|yaml|yml)$/.test(importPath)) {
    filePath = resolved;
    if (!existsSync(filePath)) {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, '');
      return `Created empty: ${filePath.replace(ROOT + '/', '')}`;
    }
    return false;
  }

  if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) {
    filePath += '.ts';
  }

  if (existsSync(filePath)) return false;

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, 'export default {};\n');
  return `Created stub: ${filePath.replace(ROOT + '/', '')}`;
}

// Main loop
let iterations = 0;
while (iterations < 20) {
  iterations++;
  console.log(`\n=== Iteration ${iterations} ===`);
  const { success, output } = run();

  if (success) {
    console.log('BUILD SUCCEEDED!');
    console.log(output);
    break;
  }

  const errors = parseErrors(output);
  if (errors.length === 0) {
    console.log('No more fixable errors. Remaining output:');
    console.log(output.substring(0, 2000));
    break;
  }

  console.log(`Found ${errors.length} resolution errors`);
  let fixed = 0;
  const seen = new Set();
  for (const err of errors) {
    const key = `${err.importPath}@${err.sourceFile}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const result = fixError(err);
    if (result) {
      console.log(`  ${result}`);
      fixed++;
    }
  }
  if (fixed === 0) {
    console.log('No new fixes possible. Remaining errors:');
    console.log(output.substring(0, 2000));
    break;
  }
}

console.log(`\nDone after ${iterations} iterations.`);
