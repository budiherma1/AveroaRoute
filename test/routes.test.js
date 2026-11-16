import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { useFixture, serve, call } from './helpers.js';
import Router, { AveroaRouter } from '../index.js';

useFixture('app');

const BEGIN = 'global.begin(files=false)';
const END = 'global.end';

describe('routes against a live server', () => {
  let srv;
  let router;

  before(async () => {
    router = Router();

    // every verb
    router.get('/verbs', 'EchoController@show');
    router.post('/verbs', 'EchoController@show');
    router.put('/verbs', 'EchoController@show');
    router.patch('/verbs', 'EchoController@show');
    router.delete('/verbs', 'EchoController@show');
    router.postForm('/form', 'EchoController@show');
    router.putForm('/form', 'EchoController@show');
    router.patchForm('/form', 'EchoController@show');
    router.match(['GET', 'post'], '/match', 'EchoController@show');
    router.any('/any', 'EchoController@show');
    router.all('/all', 'EchoController@show');
    router.get('fn', (req, res) => res.json({ fn: true }));

    // nested prefixes with the same segment
    router.prefix('/v2', () => {
      router.prefix('v2', () => {
        router.get('/x', 'EchoController@show');
      });
      router.get('/y', 'EchoController@show');
    });
    router.get('/z', 'EchoController@show');

    // nested groups with the same middleware
    router.group({ middleware: ['TraceA'] }, () => {
      router.group({ middleware: ['TraceA'], prefix: 'inner' }, () => {
        router.get('/a', 'EchoController@show');
      });
      router.get('/b', 'EchoController@show');
    });
    router.get('/c', 'EchoController@show');

    // middleware order: scope -> route (names, class export, functions)
    router.middleware(['TraceA'], () => {
      router.get('/order', 'EchoController@show', [
        'TraceB',
        'ClassMiddleware',
        (req, res, next) => { (req.trace ??= []).push('inline'); next(); },
      ]);
      router.postForm('/order-form', 'EchoController@show', [
        'TraceB',
        (req, res, next) => { (req.trace ??= []).push(`route(files=${Array.isArray(req.files)})`); next(); },
      ]);
    });

    // crud model hooks
    router.prefix('api', () => {
      router.crud('Teacher', 'teachers', () => {
        router.get('/', 'EchoController@show');
        router.get('/:id', 'EchoController@show');
        router.post('/', 'EchoController@show', ['TraceB']);
        router.postForm('/form', 'EchoController@show');
        router.put('/:id', 'EchoController@show');
        router.putForm('/:id/form', 'EchoController@show');
        router.patch('/:id', 'EchoController@show');
        router.patchForm('/:id/form', 'EchoController@show');
        router.delete('/:id', 'EchoController@show');
        router.all('/all/any', 'EchoController@show');
      });
      router.get('/outside', 'EchoController@show');
    });
    router.set('Teacher', () => {
      router.get('/set-alias', 'EchoController@show');
    });

    // controllers: class export, errors
    router.get('/class/hello', 'ClassController@hello');
    router.get('/class/other', 'ClassController@other');
    router.get('/err/async', 'ErrorController@boom');
    router.get('/err/sync', 'ErrorController@syncBoom');
    router.get('/err/middleware', 'EchoController@show', ['RejectMiddleware']);
    router.get('/err/fn', async () => { throw Object.assign(new Error('fn rejected'), { status: 409 }); });

    srv = await serve(router);
  });

  after(async () => {
    await srv?.close();
  });

  test('every verb reaches its controller', async () => {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const r = await call(srv.url, method, '/verbs');
      assert.equal(r.status, 200, method);
      assert.equal(r.body.method, method);
      assert.equal(r.body.controller, 'EchoController', 'instance method keeps `this`');
      assert.deepEqual(r.body.trace, [BEGIN, END]);
    }
    for (const method of ['POST', 'PUT', 'PATCH']) {
      const form = new FormData();
      form.append('name', 'x');
      form.append('photo', new Blob(['abc']), 'a.txt');
      const r = await call(srv.url, method, '/form', { form });
      assert.equal(r.status, 200, method);
      assert.deepEqual(r.body.files, [{ field: 'photo', size: 3 }]);
      assert.deepEqual(r.body.body, { name: 'x' });
    }
    assert.equal((await call(srv.url, 'GET', '/match')).status, 200);
    assert.equal((await call(srv.url, 'POST', '/match')).status, 200);
    assert.equal((await call(srv.url, 'PUT', '/match')).status, 404);
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal((await call(srv.url, method, '/any')).status, 200, `any ${method}`);
    }
    assert.equal((await call(srv.url, 'OPTIONS', '/all')).status, 200);
    assert.deepEqual((await call(srv.url, 'GET', '/fn')).body, { fn: true });
  });

  test('JSON routes are not parsed as multipart', async () => {
    const r = await call(srv.url, 'POST', '/verbs', { json: { a: 1 } });
    assert.deepEqual(r.body.body, { a: 1 });
    assert.deepEqual(r.body.files, []);
  });

  test('nested prefix() scopes restore correctly', async () => {
    assert.equal((await call(srv.url, 'GET', '/v2/v2/x')).status, 200);
    assert.equal((await call(srv.url, 'GET', '/v2/y')).status, 200);
    assert.equal((await call(srv.url, 'GET', '/z')).status, 200);
    assert.equal((await call(srv.url, 'GET', '/v2/x')).status, 404);
  });

  test('nested group() with the same middleware restores correctly', async () => {
    assert.deepEqual((await call(srv.url, 'GET', '/inner/a')).body.trace, [BEGIN, 'TraceA', 'TraceA', END]);
    assert.deepEqual((await call(srv.url, 'GET', '/b')).body.trace, [BEGIN, 'TraceA', END]);
    assert.deepEqual((await call(srv.url, 'GET', '/c')).body.trace, [BEGIN, END]);
  });

  test('middleware order: global beginning -> scope -> route -> global end', async () => {
    const r = await call(srv.url, 'GET', '/order');
    assert.deepEqual(r.body.trace, [BEGIN, 'TraceA', 'TraceB', 'ClassMiddleware', 'inline', END]);
  });

  test('form routes: multer runs after global + scope + route middleware, before the controller (R6)', async () => {
    const form = new FormData();
    form.append('f', new Blob(['12345']), 'f.txt');
    const r = await call(srv.url, 'POST', '/order-form', { form });
    assert.equal(r.status, 200);
    // Nothing is parsed while global/scope/route middleware (auth) runs ...
    assert.deepEqual(r.body.trace, [BEGIN, 'TraceA', 'TraceB', 'route(files=false)', END]);
    // ... but the controller gets the files.
    assert.deepEqual(r.body.files, [{ field: 'f', size: 5 }]);
  });

  test('crud: post gets create:true and type json, hooks after global end', async () => {
    const r = await call(srv.url, 'POST', '/api/teachers', { json: { name: 'a' } });
    assert.equal(r.status, 200);
    const additional = { type: 'json', create: true, pref: 'apiteachers' };
    assert.deepEqual(r.body.hooks, [
      { hook: 'checkParamId', additional, thisIsModel: true },
      { hook: 'validationRouter', additional, thisIsModel: true },
      { hook: 'mapRequest', additional, thisIsModel: true },
    ]);
    assert.deepEqual(r.body.trace, [
      BEGIN, 'TraceB', END, 'model.checkParamId', 'model.validationRouter', 'model.mapRequest',
    ]);
  });

  test('crud: postForm is multipart + create', async () => {
    const form = new FormData();
    form.append('name', 'a');
    const r = await call(srv.url, 'POST', '/api/teachers/form', { form });
    // multer runs after global end and before the model hooks, so hooks see req.body.
    assert.deepEqual(r.body.trace, [BEGIN, END, 'model.checkParamId', 'model.validationRouter', 'model.mapRequest']);
    assert.deepEqual(r.body.body, { name: 'a' });
    assert.deepEqual(r.body.hooks.map((h) => h.hook), ['checkParamId', 'validationRouter', 'mapRequest']);
    for (const h of r.body.hooks) {
      assert.deepEqual(h.additional, { type: 'multipart', create: true, pref: 'apiteachers' });
    }
  });

  test('crud: put/patch are not create; *Form variants are multipart', async () => {
    for (const method of ['PUT', 'PATCH']) {
      const r = await call(srv.url, method, '/api/teachers/7', { json: {} });
      assert.deepEqual(r.body.hooks.map((h) => h.hook), ['checkParamId', 'validationRouter', 'mapRequest']);
      for (const h of r.body.hooks) {
        assert.deepEqual(h.additional, { type: 'json', create: false, pref: 'apiteachers' });
      }
      assert.deepEqual(r.body.params, { id: '7' });

      const f = await call(srv.url, method, '/api/teachers/7/form', { form: new FormData() });
      for (const h of f.body.hooks) {
        assert.deepEqual(h.additional, { type: 'multipart', create: false, pref: 'apiteachers' });
      }
    }
  });

  test('crud: get/delete get checkParamId + mapRequest only', async () => {
    for (const [method, url] of [['GET', '/api/teachers'], ['GET', '/api/teachers/3'], ['DELETE', '/api/teachers/3']]) {
      const r = await call(srv.url, method, url);
      assert.deepEqual(r.body.hooks.map((h) => h.hook), ['checkParamId', 'mapRequest'], `${method} ${url}`);
      assert.deepEqual(r.body.hooks[0].additional, { type: 'json', create: false, pref: 'apiteachers' });
    }
  });

  test('crud: a hook can end the request; all() and routes outside crud get no hooks', async () => {
    const missing = await call(srv.url, 'GET', '/api/teachers/404');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.status, false);
    assert.deepEqual((await call(srv.url, 'GET', '/api/teachers/all/any')).body.hooks, []);
    assert.deepEqual((await call(srv.url, 'GET', '/api/outside')).body.hooks, []);
    const alias = await call(srv.url, 'GET', '/set-alias');
    assert.deepEqual(alias.body.hooks.map((h) => h.hook), ['checkParamId', 'mapRequest']);
    assert.equal(alias.body.hooks[0].additional.pref, '');
  });

  test('class controllers are instantiated once and keep `this`', async () => {
    const a = await call(srv.url, 'GET', '/class/hello');
    assert.equal(a.body.greeting, 'hello from class');
    assert.equal(a.body.instances, 1);
    assert.equal((await call(srv.url, 'GET', '/class/other')).body.instances, 1);
  });

  test('async and sync errors reach the error handler', async () => {
    assert.deepEqual(await call(srv.url, 'GET', '/err/async'), { status: 418, body: { error: 'async boom', code: null } });
    assert.equal((await call(srv.url, 'GET', '/err/sync')).status, 500);
    assert.deepEqual((await call(srv.url, 'GET', '/err/middleware')).body.error, 'middleware rejected');
    assert.equal((await call(srv.url, 'GET', '/err/middleware')).status, 401);
    assert.equal((await call(srv.url, 'GET', '/err/fn')).status, 409);
  });

  test('global middleware provider is resolved once at init, not per request', async () => {
    const { MiddlewareProvider } = await import('./fixtures/app/app/Providers/index.js');
    await call(srv.url, 'GET', '/verbs');
    await call(srv.url, 'GET', '/verbs');
    assert.deepEqual(MiddlewareProvider.calls, { beginning: 1, end: 1 });
  });
});

describe('init() validation and lifecycle', () => {
  test('missing controller file names the route', async () => {
    const r = Router();
    r.get('/nope', 'MissingController@index');
    await assert.rejects(r.init(), (err) => {
      assert.match(err.message, /GET \/nope/);
      assert.match(err.message, /controller file not found/);
      assert.match(err.message, /MissingController\.js/);
      return true;
    });
  });

  test('missing controller method names the route and method', async () => {
    const r = Router();
    r.prefix('p', () => r.post('/x', 'EchoController@nothing'));
    await assert.rejects(r.init(), /route POST \/p\/x: method "nothing" not found on controller EchoController/);
  });

  test('missing middleware and incomplete model fail at init', async () => {
    const m = Router();
    m.get('/m', 'EchoController@show', ['NoSuchMiddleware']);
    await assert.rejects(m.init(), /route GET \/m: middleware file not found: .*NoSuchMiddleware\.js/);

    const b = Router();
    b.crud('Broken', 'b', () => b.get('/', 'EchoController@show'));
    await assert.rejects(b.init(), /model Broken .* is missing validationRouter, mapRequest/);
  });

  test('malformed handler strings throw immediately', () => {
    const r = Router();
    assert.throws(() => r.get('/x', 'EchoController'), /GET \/x: handler "EchoController" must look like "Controller@method"/);
    assert.throws(() => r.get('/x', 42), TypeError);
    assert.throws(() => r.match(['fetch'], '/x', 'A@b'), /unsupported verb "fetch"/);
  });

  test('scopes are restored even when the callback throws', () => {
    const r = Router();
    assert.throws(() => r.group({ prefix: 'g', middleware: ['TraceA'] }, () => { throw new Error('cb'); }), /cb/);
    r.get('/after', 'EchoController@show');
    assert.equal(r.routes[0].path, '/after');
    assert.deepEqual(r.routes[0].middleware, []);
  });

  test('async scope callbacks throw instead of silently dropping prefix/middleware (R14)', async () => {
    const r = Router();
    const scopes = [
      () => r.group({ prefix: 'g', middleware: ['TraceA'] }, async () => { r.get('/a', 'EchoController@show'); }),
      () => r.prefix('p', async () => {}),
      () => r.middleware(['TraceA'], async () => {}),
      () => r.crud('Teacher', 'teachers', async () => {}),
      () => r.set('Teacher', 'teachers', () => Promise.resolve()),
      () => r.prefix('rejects', async () => { throw new Error('inside'); }),
    ];
    for (const declare of scopes) {
      assert.throws(declare, /scope callbacks must be synchronous/);
    }
    // Scopes were popped: a later route has no prefix and no middleware.
    r.get('/after', 'EchoController@show');
    const after = r.routes.find((x) => x.path === '/after');
    assert.deepEqual(after.middleware, []);
    assert.equal(after.model, null);
    // Sync callbacks (and non-promise return values) are still fine.
    r.prefix('ok', () => r.get('/x', 'EchoController@show'));
    assert.ok(r.routes.some((x) => x.path === '/ok/x'));
  });

  test('init() is idempotent and routes cannot be added afterwards', async () => {
    const r = Router();
    r.get('/', 'EchoController@show');
    const first = await r.init();
    assert.equal(await r.init(), first);
    assert.throws(() => r.get('/late', 'EchoController@show'), /after init\(\)/);
  });

  test('default export is a factory; methods chain', () => {
    const r = Router();
    assert.ok(r instanceof AveroaRouter);
    assert.equal(r.get('/a', 'A@b').post('/a', 'A@b'), r);
  });

  test('config() changes controller folder and middleware method', async () => {
    const r = Router();
    r.config({ controller: { path: '/app/Alt/' }, middleware: { method: 'run' } });
    r.get('/alt', 'AltController@ping', ['TraceA']);
    const srv = await serve(r);
    try {
      const res = await call(srv.url, 'GET', '/alt');
      assert.deepEqual(res.body, { alt: true, trace: [BEGIN, 'TraceA.run', END] });
    } finally {
      await srv.close();
    }
  });
});

describe('upload limits', () => {
  const fileOf = (bytes) => {
    const form = new FormData();
    form.append('file', new Blob([Buffer.alloc(bytes, 1)]), 'f.bin');
    return form;
  };

  test('config({ upload: { limits } }) rejects larger files with 413', async () => {
    const r = Router();
    r.config({ upload: { limits: { fileSize: 1024 } } });
    r.postForm('/up', 'EchoController@show');
    const srv = await serve(r);
    try {
      const big = await call(srv.url, 'POST', '/up', { form: fileOf(2048) });
      assert.equal(big.status, 413);
      assert.equal(big.body.code, 'LIMIT_FILE_SIZE');
      const ok = await call(srv.url, 'POST', '/up', { form: fileOf(512) });
      assert.equal(ok.status, 200);
      assert.deepEqual(ok.body.files, [{ field: 'file', size: 512 }]);
    } finally {
      await srv.close();
    }
  });

  test('env UPLOAD_MAX_FILE_SIZE sets the limit; config wins over env', async () => {
    process.env.UPLOAD_MAX_FILE_SIZE = '100';
    try {
      const r = Router();
      r.postForm('/up', 'EchoController@show');
      const c = Router();
      c.config({ upload: { limits: { fileSize: 1000 } } });
      c.postForm('/up', 'EchoController@show');
      const a = await serve(r);
      const b = await serve(c);
      try {
        assert.equal((await call(a.url, 'POST', '/up', { form: fileOf(200) })).status, 413);
        assert.equal((await call(b.url, 'POST', '/up', { form: fileOf(200) })).status, 200);
      } finally {
        await a.close();
        await b.close();
      }
    } finally {
      delete process.env.UPLOAD_MAX_FILE_SIZE;
    }
  });

  test('rejecting middleware runs before multer: no upload is parsed for unauthenticated requests (R6)', async () => {
    const r = Router();
    r.config({ upload: { limits: { fileSize: 10 } } });
    let parsed = 0;
    const countParsed = (req, res, next) => { parsed += Array.isArray(req.files) ? 1 : 0; next(); };
    r.postForm('/guarded', 'EchoController@show', ['RejectMiddleware']);
    r.postForm('/open', 'EchoController@show', [countParsed]);
    const srv = await serve(r);
    try {
      // Over the fileSize limit: if multer ran first this would be 413.
      const guarded = await call(srv.url, 'POST', '/guarded', { form: fileOf(1024) });
      assert.equal(guarded.status, 401);
      assert.equal(guarded.body.error, 'middleware rejected');
      const open = await call(srv.url, 'POST', '/open', { form: fileOf(1024) });
      assert.equal(open.status, 413);
      assert.equal(parsed, 0, 'route middleware ran before multer');
    } finally {
      await srv.close();
    }
  });

  test('default limits: files, fields, fieldSize and parts (R6)', async () => {
    const { DEFAULT_UPLOAD_LIMITS, resolveUploadLimits } = await import('../index.js');
    assert.deepEqual({ ...DEFAULT_UPLOAD_LIMITS }, {
      fileSize: 10 * 1024 * 1024, files: 10, fields: 100, fieldSize: 1024 * 1024,
    });
    assert.deepEqual(resolveUploadLimits(), { ...DEFAULT_UPLOAD_LIMITS, parts: 110 });

    const r = Router();
    r.postForm('/up', 'EchoController@show');
    const srv = await serve(r);
    try {
      const files = (n) => {
        const form = new FormData();
        for (let i = 0; i < n; i += 1) form.append(`f${i}`, new Blob(['x']), 'x.txt');
        return form;
      };
      assert.equal((await call(srv.url, 'POST', '/up', { form: files(10) })).status, 200);
      const tooManyFiles = await call(srv.url, 'POST', '/up', { form: files(11) });
      assert.equal(tooManyFiles.status, 400);
      assert.equal(tooManyFiles.body.code, 'LIMIT_FILE_COUNT');

      const fields = new FormData();
      for (let i = 0; i < 101; i += 1) fields.append(`k${i}`, 'v');
      const tooManyFields = await call(srv.url, 'POST', '/up', { form: fields });
      assert.equal(tooManyFields.status, 400);
      assert.equal(tooManyFields.body.code, 'LIMIT_FIELD_COUNT');

      const big = new FormData();
      big.append('text', 'a'.repeat(1024 * 1024 + 1));
      const bigField = await call(srv.url, 'POST', '/up', { form: big });
      assert.equal(bigField.status, 400);
      assert.equal(bigField.body.code, 'LIMIT_FIELD_VALUE');
    } finally {
      await srv.close();
    }
  });

  test('env UPLOAD_MAX_FILES and config limits override the defaults (R6)', async () => {
    const { resolveUploadLimits } = await import('../index.js');
    process.env.UPLOAD_MAX_FILES = '2';
    try {
      assert.equal(resolveUploadLimits().files, 2);
      assert.equal(resolveUploadLimits().parts, 102);
      assert.equal(resolveUploadLimits({ files: 5 }).files, 5, 'config wins over env');
      assert.equal(resolveUploadLimits({ files: 5, parts: 7 }).parts, 7);

      const r = Router();
      r.postForm('/up', 'EchoController@show');
      const c = Router();
      c.config({ upload: { limits: { files: 3, fields: 1 } } });
      c.postForm('/up', 'EchoController@show');
      const a = await serve(r);
      const b = await serve(c);
      const form = (nFiles, nFields) => {
        const f = new FormData();
        for (let i = 0; i < nFields; i += 1) f.append(`k${i}`, 'v');
        for (let i = 0; i < nFiles; i += 1) f.append(`f${i}`, new Blob(['x']), 'x.txt');
        return f;
      };
      try {
        assert.equal((await call(a.url, 'POST', '/up', { form: form(2, 0) })).status, 200);
        assert.equal((await call(a.url, 'POST', '/up', { form: form(3, 0) })).body.code, 'LIMIT_FILE_COUNT');
        assert.equal((await call(b.url, 'POST', '/up', { form: form(3, 1) })).status, 200);
        assert.equal((await call(b.url, 'POST', '/up', { form: form(4, 0) })).body.code, 'LIMIT_FILE_COUNT');
        assert.equal((await call(b.url, 'POST', '/up', { form: form(0, 2) })).body.code, 'LIMIT_FIELD_COUNT');
      } finally {
        await a.close();
        await b.close();
      }
    } finally {
      delete process.env.UPLOAD_MAX_FILES;
    }
  });

  test('default limit is 10 MB', async () => {
    const { DEFAULT_MAX_FILE_SIZE } = await import('../index.js');
    assert.equal(DEFAULT_MAX_FILE_SIZE, 10 * 1024 * 1024);
    const r = Router();
    r.postForm('/up', 'EchoController@show');
    const srv = await serve(r);
    try {
      assert.equal((await call(srv.url, 'POST', '/up', { form: fileOf(10 * 1024 * 1024 + 1) })).status, 413);
      assert.equal((await call(srv.url, 'POST', '/up', { form: fileOf(1024 * 1024) })).status, 200);
    } finally {
      await srv.close();
    }
  });
});
