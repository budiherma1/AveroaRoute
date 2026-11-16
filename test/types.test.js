// Keeps index.d.ts in step with the runtime: every runtime export and every public
// AveroaRouter method is declared, and nothing is declared that does not exist.
// The usage checks themselves live in test/types/*.ts (npm run typecheck).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as routes from '../index.js';

const dts = fs.readFileSync(new URL('../index.d.ts', import.meta.url), 'utf8');

/** Methods index.js marks @private (internal steps of init()/scopes): not declared on purpose. */
const PRIVATE_METHODS = new Set([
  'scope', 'add', 'build', 'createUpload', 'modelHooks', 'load', 'resolveHandler',
  'instantiate', 'instanceOf', 'resolveMiddleware', 'toMiddleware', 'resolveModel',
  'resolveGlobalMiddleware',
]);

test('index.d.ts declares exactly the runtime exports', () => {
  const declared = new Set(
    [...dts.matchAll(/^export (?:declare )?(?:function|class|const) (\w+)/gm)].map((m) => m[1]),
  );
  if (/^export default \w+;/m.test(dts)) declared.add('default');
  assert.deepEqual([...declared].sort(), Object.keys(routes).sort());
  assert.equal(routes.default, routes.Router);
});

test('index.d.ts declares every public AveroaRouter method', () => {
  const body = dts.slice(dts.indexOf('export class AveroaRouter'));
  const classBody = body.slice(0, body.indexOf('\n}\n'));
  const declared = new Set([...classBody.matchAll(/^ {2}(\w+)(?:<[^(]*>)?\(/gm)].map((m) => m[1]));
  declared.delete('constructor');

  const runtime = Object.getOwnPropertyNames(routes.AveroaRouter.prototype)
    .filter((name) => name !== 'constructor' && !PRIVATE_METHODS.has(name));
  assert.deepEqual([...declared].sort(), [...new Set(runtime)].sort());

  // static factory
  assert.match(classBody, /^ {2}static Router</m);
  assert.equal(typeof routes.AveroaRouter.Router, 'function');
});

test('index.d.ts declares the documented instance properties', () => {
  const router = routes.Router();
  for (const prop of ['routes', 'router']) {
    assert.ok(prop in router, `runtime has ${prop}`);
    assert.match(dts, new RegExp(`^ {2}${prop}: `, 'm'), `index.d.ts declares ${prop}`);
  }
});
