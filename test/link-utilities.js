// Dev-only helper (runs as `pretest`). @averoa/utilities@^2 is a peer dependency
// that may not be published yet. When `@averoa/utilities/paths` cannot be
// resolved, create a tiny shim package in node_modules that re-exports the
// sibling repo's paths.js (../AveroaUtilities, or $AVEROA_UTILITIES_DIR).
// paths.js has no dependencies, so nothing is installed into the sibling repo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shimDir = path.join(root, 'node_modules', '@averoa', 'utilities');
const marker = 'averoa-routes-test-shim';

try {
  await import('@averoa/utilities/paths');
  process.exit(0);
} catch {
  // fall through and create the shim
}

const siblingDir = path.resolve(process.env.AVEROA_UTILITIES_DIR || path.join(root, '..', 'AveroaUtilities'));
const siblingPaths = path.join(siblingDir, 'paths.js');
if (!fs.existsSync(siblingPaths)) {
  console.error(`[pretest] @averoa/utilities is not installed and ${siblingPaths} does not exist.`);
  console.error('[pretest] Install @averoa/utilities@^2 or set AVEROA_UTILITIES_DIR.');
  process.exit(1);
}

const pkgFile = path.join(shimDir, 'package.json');
if (fs.existsSync(pkgFile) && !JSON.parse(fs.readFileSync(pkgFile, 'utf8'))[marker]) {
  console.error(`[pretest] ${shimDir} exists but does not export ./paths; refusing to overwrite it.`);
  process.exit(1);
}

fs.mkdirSync(shimDir, { recursive: true });
fs.writeFileSync(pkgFile, `${JSON.stringify({
  name: '@averoa/utilities',
  version: '2.0.0',
  type: 'module',
  private: true,
  [marker]: true,
  exports: { './paths': './paths.js' },
}, null, 2)}\n`);
fs.writeFileSync(
  path.join(shimDir, 'paths.js'),
  `export * from ${JSON.stringify(pathToFileURL(siblingPaths).href)};\n`,
);
console.log(`[pretest] linked @averoa/utilities/paths -> ${siblingPaths}`);
