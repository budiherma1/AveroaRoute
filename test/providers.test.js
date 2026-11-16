import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { useFixture, serve, call } from './helpers.js';
import Router from '../index.js';

test('MiddlewareProvider.beginning()/end() may return undefined (boilerplate)', async () => {
  useFixture('bare');
  const r = Router();
  r.get('/', 'HomeController@index');
  const srv = await serve(r);
  try {
    assert.deepEqual(await call(srv.url, 'GET', '/'), { status: 200, body: { fixture: 'bare' } });
  } finally {
    await srv.close();
  }
});

test('app/Providers/index.js is optional', async () => {
  useFixture('noproviders');
  const r = Router();
  r.get('/', 'HomeController@index');
  const srv = await serve(r);
  try {
    assert.deepEqual(await call(srv.url, 'GET', '/'), { status: 200, body: { fixture: 'noproviders' } });
  } finally {
    await srv.close();
  }
});

test('classes with static methods are used as is, not instantiated (R10, 1.x compat)', async () => {
  useFixture('static');
  const r = Router();
  class InlineStatic {
    static handle(req, res, next) { (req.trace ??= []).push('inline.static'); next(); }
  }
  r.get('/', 'StaticController@index', ['StaticMiddleware', InlineStatic]);
  const srv = await serve(r);
  try {
    const res = await call(srv.url, 'GET', '/');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      controller: 'StaticController', // static `this` is the class
      constructed: 0,
      trace: ['static.global', 'StaticMiddleware', 'inline.static', 'static.end'],
    });
    const { default: StaticMiddleware } = await import('./fixtures/static/app/Middleware/StaticMiddleware.js');
    const { MiddlewareProvider } = await import('./fixtures/static/app/Providers/index.js');
    assert.equal(StaticMiddleware.constructed, 0);
    assert.equal(MiddlewareProvider.constructed, 0);
  } finally {
    await srv.close();
  }
});

test('source uses no eval and no node_modules-relative app imports', () => {
  const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\beval\s*\(|new Function/);
  assert.doesNotMatch(src, /\.\/\.\.\/\.\.\//);
  assert.doesNotMatch(src, /@averoa\/providers/);
});
