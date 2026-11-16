import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useFixture, serve, call } from './helpers.js';
import Router, { toOpenApiPaths } from '../index.js';
import Teacher from './fixtures/app/app/Models/Teacher.js';

useFixture('app');

test('toOpenApiPaths converts Express 5 paths to OpenAPI templates', () => {
  assert.deepEqual(toOpenApiPaths('/teachers/:id'), [{ path: '/teachers/{id}', params: [{ name: 'id', wildcard: false }] }]);
  assert.deepEqual(toOpenApiPaths('/files/*path'), [{ path: '/files/{path}', params: [{ name: 'path', wildcard: true }] }]);
  assert.deepEqual(toOpenApiPaths('/a/:x-:y'), [{
    path: '/a/{x}-{y}',
    params: [{ name: 'x', wildcard: false }, { name: 'y', wildcard: false }],
  }]);
  assert.deepEqual(toOpenApiPaths('/files{/:name}').map((v) => v.path), ['/files', '/files/{name}']);
  assert.deepEqual(
    toOpenApiPaths('/a{/:b{/:c}}').map((v) => v.path),
    ['/a', '/a/{b}', '/a/{b}/{c}'],
  );
  assert.deepEqual(toOpenApiPaths('/:"user-id"'), [{ path: '/{user-id}', params: [{ name: 'user-id', wildcard: false }] }]);
  assert.deepEqual(toOpenApiPaths('/price\\:usd'), [{ path: '/price:usd', params: [] }]);
  assert.deepEqual(toOpenApiPaths('/'), [{ path: '/', params: [] }]);
});

test('describe() lists every verb, path, handler, middleware chain and crud model after init()', async () => {
  const router = Router();
  function inlineCheck(req, res, next) { next(); }
  router.get('/', 'EchoController@show');
  router.group({ middleware: ['TraceA'], prefix: 'v1' }, () => {
    router.post('/login', 'EchoController@show', [inlineCheck]);
    router.crud('Teacher', 'teachers', () => {
      router.get('/', 'EchoController@show');
      router.get('/:id', 'EchoController@show');
      router.putForm('/:id', 'EchoController@show', ['TraceB']);
    });
  });
  router.match(['get', 'post'], '/both', (req, res) => res.json({}));
  router.get('/files{/:name}', 'EchoController@show');

  assert.throws(() => router.describe(), /once init\(\) has resolved/);
  await router.init();
  const routes = router.describe();

  assert.deepEqual(
    routes.map((r) => `${r.method.toUpperCase()} ${r.openapiPath}`),
    [
      'GET /', 'POST /v1/login', 'GET /v1/teachers', 'GET /v1/teachers/{id}', 'PUT /v1/teachers/{id}',
      'GET /both', 'POST /both', 'GET /files', 'GET /files/{name}',
    ],
  );

  const login = routes[1];
  assert.equal(login.path, '/v1/login');
  assert.equal(login.handler, 'EchoController@show');
  // MiddlewareProvider beginning (a class instance) and end (an arrow function) wrap the scope/route middleware
  assert.deepEqual(login.middleware, ['GlobalBegin', 'TraceA', 'inlineCheck', 'anonymous']);
  assert.equal(login.middlewareEntries[2], inlineCheck);
  assert.equal(login.model, null);
  assert.equal(login.modelClass, null);
  assert.deepEqual(login.hooks, []);
  assert.equal(login.form, false);
  assert.equal(login.doc, null);

  const update = routes[4];
  assert.equal(update.model, 'Teacher');
  assert.equal(update.modelClass, Teacher);
  assert.equal(update.form, true);
  assert.deepEqual(update.hooks, ['checkParamId', 'validationRouter', 'mapRequest']);
  assert.deepEqual(update.params, [{ name: 'id', wildcard: false }]);
  assert.deepEqual(update.middleware, ['GlobalBegin', 'TraceA', 'TraceB', 'anonymous']);
  assert.deepEqual(routes[3].hooks, ['checkParamId', 'mapRequest']);

  assert.equal(routes[5].handler, 'anonymous');
  assert.equal(routes[7].path, '/files{/:name}');

  // a copy: changing it doesn't change the router
  routes[0].middleware.push('x');
  assert.equal(router.describe()[0].middleware.includes('x'), false);
});

test('doc() attaches documentation to the previous route and stays backward compatible', async () => {
  const router = Router();
  assert.throws(() => router.doc({ summary: 'x' }), /must follow a route definition/);

  router.get('/a', 'EchoController@show').doc({ summary: 'A', tags: ['Letters'] }).doc({ description: 'More' });
  router.post('/b', 'EchoController@show');
  router.crud('Teacher', 'teachers', () => {
    router.get('/', 'EchoController@show').doc({ summary: 'List teachers' });
  });
  assert.throws(() => router.doc(null), /expects an object/);
  assert.throws(() => router.doc(['x']), /expects an object/);

  const srv = await serve(router);
  try {
    const res = await call(srv.url, 'GET', '/a');
    assert.equal(res.status, 200, 'doc() does not change routing');
  } finally {
    await srv.close();
  }

  const [a, b, list] = router.describe();
  assert.deepEqual(a.doc, { summary: 'A', tags: ['Letters'], description: 'More' });
  assert.equal(b.doc, null);
  assert.equal(list.doc.summary, 'List teachers');
  assert.throws(() => router.doc({ summary: 'late' }), /after init\(\)/);
});
