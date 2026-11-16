<div align="center">

<h1>@averoa/routes</h1>

<p>Laravel-style route definitions for Express 5: <code>'Controller@method'</code> strings, named middleware, groups, prefixes and <code>crud()</code> model hooks, compiled into a plain <code>express.Router</code>.</p>

<p>
  <a href="https://www.npmjs.com/package/@averoa/routes"><img src="https://img.shields.io/npm/v/@averoa/routes" alt="npm version"></a>
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933" alt="Node.js >= 20">
  <img src="https://img.shields.io/badge/express-5-000000" alt="Express 5">
  <a href="https://github.com/budiherma1/averoajs"><img src="https://img.shields.io/badge/part%20of-AveroaJS-6f42c1" alt="Part of AveroaJS"></a>
</p>

</div>

## Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick start](#quick-start)
- [API reference](#api-reference)
- [Handler order](#handler-order)
- [Controller resolution](#controller-resolution)
- [Middleware resolution](#middleware-resolution)
- [crud() model hooks](#crud-model-hooks)
- [Uploads](#uploads)
- [Configuration](#configuration)
- [Scopes](#scopes)
- [Paths and Express 5 syntax](#paths-and-express-5-syntax)
- [Route metadata and documentation](#route-metadata-and-documentation)
- [TypeScript](#typescript)
- [Testing](#testing)
- [Upgrading from 2.x](#upgrading-from-2x)
- [Related packages](#related-packages)
- [License](#license)

## Overview

`@averoa/routes` is the router of [AveroaJS](https://github.com/budiherma1/averoajs). You declare routes in a
readable, Laravel-like style:

```js
router.get('/users/:id', 'UserController@show', ['AuthMiddleware']);
```

Declaring a route only records it. When you call `await router.init()`, the router loads the controllers,
middleware and models from your application, checks that every one of them exists, and registers real handler
functions on an `express.Router`. A typo in a controller name, method, middleware or model makes `init()` reject
with an error that names the route, so it fails at startup instead of on the first request.

Most applications get this package through the [AveroaJS boilerplate](https://github.com/budiherma1/averoajs),
where `routes/api.js` and `routes/web.js` are router definitions and
[`@averoa/core`](https://github.com/budiherma1/AveroaCore) mounts them. This page is the reference for the package
itself; it also works on its own with plain Express 5.

Highlights:

- `'Controller@method'` handlers or plain functions; controllers may be instances, classes or classes with static
  methods.
- Middleware by name, function, object or class; scope middleware and route middleware both run.
- `group()`, `prefix()`, `middleware()` and `crud()` scopes that nest and are restored even when a callback throws.
- `crud()` attaches the `checkParamId`, `validationRouter` and `mapRequest` hooks of a model to every route in the
  scope.
- `*Form` routes parse `multipart/form-data` with multer 2 (memory storage), with upload limits on by default, and
  only after your middleware has accepted the request.
- Global middleware from the application's `MiddlewareProvider`.
- No `eval`. Thrown errors and rejected promises reach `next(err)`.

## Installation

```bash
npm install @averoa/routes express@^5 @averoa/utilities@^2
```

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js | `>=20` | from `engines`; the same as `@averoa/utilities@^2` |
| `express` | `^5.1.0` | peer dependency |
| `@averoa/utilities` | `^2.0.0` | peer dependency; only `@averoa/utilities/paths` is used, to find the application root |
| `multer` | `^2.0.2` | regular dependency, installed for you |

The package is an ES module (`"type": "module"`); the examples use `import` and top-level `await`.

## Quick start

### 1. A routes file

```js
// routes/api.js
import Router from '@averoa/routes';

const router = Router();

router.get('/', 'HomeController@index');
router.get('/health', (req, res) => res.json({ ok: true }));
router.post('/auth/login', 'AuthController@login');

router.middleware(['AuthMiddleware'], () => {
  router.get('/auth/me', 'AuthController@me');
});

router.group({ prefix: 'admin', middleware: ['AuthMiddleware'] }, () => {
  router.crud('Teacher', 'teachers', () => {
    router.get('/', 'TeacherController@findAll');
    router.get('/:id', 'TeacherController@findOne');
    router.post('/', 'TeacherController@create');            // JSON body
    router.postForm('/upload', 'TeacherController@create');  // multipart/form-data
    router.put('/:id', 'TeacherController@update');
    router.delete('/:id', 'TeacherController@delete');
  });
});

export default router;
```

Every controller, middleware and model named in the routes file must exist in the application, or `init()`
rejects with an error naming the route.

### 2. A controller

`'HomeController@index'` loads `app/Controllers/HomeController.js` (relative to the application root) and calls
its `index` method with `this` bound to the controller.

```js
// app/Controllers/HomeController.js
class HomeController {
  async index(req, res) {
    res.json({ message: 'Hello from AveroaJS' });
  }
}

export default new HomeController();
```

Exporting the class itself (`export default HomeController`) also works; see
[Controller resolution](#controller-resolution).

A named middleware works the same way: `'AuthMiddleware'` loads `app/Middleware/AuthMiddleware.js` and uses its
`handle(req, res, next)` method.

```js
// app/Middleware/AuthMiddleware.js
class AuthMiddleware {
  handle(req, res, next) {
    if (!req.headers.authorization) return res.status(401).json({ message: 'Unauthorized' });
    return next();
  }
}

export default new AuthMiddleware();
```

### 3. Mount the router

**With `@averoa/core` (the boilerplate).** Nothing to do. On boot, `@averoa/core` imports `routes/api.js` and
`routes/web.js` (both optional), calls `init()` on each default export, and mounts the API router under `/api` and
the web router under `/`.

**With plain Express 5.** Call `init()` once, after every route is declared, and mount the `express.Router` it
resolves to:

```js
// server.js
import express from 'express';
import router from './routes/api.js';

const app = express();
app.use(express.json()); // body parsers are the app's job; *Form routes parse multipart themselves

app.use('/api', await router.init());

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  res.status(err.status ?? 500).json({ message: err.message, code: err.code });
});

app.listen(3000);
```

The application root is found by `@averoa/utilities/paths`: the `AVEROA_ROOT` environment variable if it is set,
otherwise the nearest directory at or above `process.cwd()` that contains a `package.json` (outside `node_modules`).
Controllers, middleware, models and `app/Providers/index.js` are resolved from there.

## API reference

### Exports

```js
import Router, {
  Router as createRouter,   // same function as the default export
  AveroaRouter,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_UPLOAD_LIMITS,
  resolveUploadLimits,
  toOpenApiPaths,
} from '@averoa/routes';
```

| Export | Type | Description |
| --- | --- | --- |
| `default` / `Router()` | `() => AveroaRouter` | Creates a new, empty router definition. |
| `AveroaRouter` | class | The router definition class. `new AveroaRouter()` and the static factory `AveroaRouter.Router()` are equivalent to `Router()`. |
| `DEFAULT_MAX_FILE_SIZE` | `number` | `10485760` (10 MB), the default `fileSize` limit for `*Form` routes. |
| `DEFAULT_UPLOAD_LIMITS` | frozen object | `{ fileSize: 10485760, files: 10, fields: 100, fieldSize: 1048576 }` |
| `resolveUploadLimits(configured?)` | `(object) => object` | Returns the multer limits a `*Form` route would use. See [Uploads](#uploads). |
| `toOpenApiPaths(path)` | `(string) => Array<{ path, params }>` | Converts an Express 5 path to OpenAPI path templates. See [Route metadata and documentation](#route-metadata-and-documentation). |

Each call to `Router()` returns an independent definition with its own routes, configuration and caches.

### Route methods

Every route method records a route and returns the router, so calls can be chained:

```js
router
  .get('/posts', 'PostController@index')
  .post('/posts', 'PostController@store', ['AuthMiddleware']);
```

| Method | Registers | Notes |
| --- | --- | --- |
| `get(uri, handler, middleware?)` | `GET` | Express 5 also answers `HEAD` for `GET` routes. |
| `post(uri, handler, middleware?)` | `POST` | Body comes from the app's own parsers (for example `express.json()`). |
| `put(uri, handler, middleware?)` | `PUT` | |
| `patch(uri, handler, middleware?)` | `PATCH` | |
| `delete(uri, handler, middleware?)` | `DELETE` | |
| `postForm(uri, handler, middleware?)` | `POST` | Parses `multipart/form-data`; see [Uploads](#uploads). |
| `putForm(uri, handler, middleware?)` | `PUT` | Same, multipart. |
| `patchForm(uri, handler, middleware?)` | `PATCH` | Same, multipart. |
| `match(verbs, uri, handler, middleware?)` | each verb in `verbs` | `verbs` is a string or an array, case-insensitive. Allowed: `get`, `post`, `put`, `patch`, `delete`, `head`, `options`, `all`. Anything else throws `unsupported verb`. |
| `any(uri, handler, middleware?)` | `GET`, `POST`, `PUT`, `DELETE`, `PATCH` | One registration per verb. |
| `all(uri, handler, middleware?)` | every verb (`express.Router#all`) | Never receives `crud()` model hooks. |

Arguments:

- **`uri`**: a path string, joined to the prefixes of the enclosing scopes. See
  [Paths and Express 5 syntax](#paths-and-express-5-syntax).
- **`handler`**: either a `'Controller@method'` string or a function `(req, res, next)`. A string must contain
  exactly one `@` with text on both sides, otherwise the call throws immediately
  (`handler "X" must look like "Controller@method"`). Any other type throws a `TypeError`.
- **`middleware`** (optional): one entry or an array of entries. An entry is a middleware name, a function, an
  object with the middleware method, or a class. See [Middleware resolution](#middleware-resolution).

Declaring a route while `init()` is running or after it has resolved throws (`cannot add GET /x after init()`).
After `init()` rejects, routes can be declared again; see [init()](#init).

### Scope methods

Every scope method runs `callback` immediately, applies the scope to every route declared inside it, and returns the
router. The callback receives the router as its only argument and **must be synchronous** (see [Scopes](#scopes)).

| Method | Effect on routes declared in `callback` |
| --- | --- |
| `middleware(names, callback)` | Adds middleware (`names`: one entry or an array) before each route's own middleware. |
| `prefix(prefix, callback)` | Prepends a path prefix. |
| `group({ prefix?, middleware? }, callback)` | Both at once. Either key may be omitted. |
| `crud(model, prefix?, callback)` | Prepends `prefix` (optional; `crud(model, callback)` is allowed) and attaches the hooks of `app/Models/<model>.js`. See [crud() model hooks](#crud-model-hooks). |
| `set(model, prefix?, callback)` | Alias of `crud()`. |

### config(options)

Sets folders, the middleware method name and upload limits. Every key is optional and the call returns the router.
Values are read when `init()` runs, so `config()` may be called before or after declaring routes, but has no
effect once `init()` has been called.

```js
router.config({
  controller: { path: 'app/Controllers' },
  middleware: { path: 'app/Middleware', method: 'handle' },
  model: { path: 'app/Models' },
  upload: { limits: { fileSize: 5 * 1024 * 1024 } },
});
```

| Key | Default | Description |
| --- | --- | --- |
| `controller.path` | `'app/Controllers'` | Folder of controllers, relative to the application root. |
| `middleware.path` | `'app/Middleware'` | Folder of named middleware, relative to the application root. |
| `middleware.method` | `'handle'` | Method called on middleware objects and classes in scopes and route arrays. `MiddlewareProvider` entries always use `handle`. |
| `model.path` | `'app/Models'` | Folder of models used by `crud()`, relative to the application root. |
| `upload.limits` | `{}` | multer limits for `*Form` routes. Any multer limit key; wins over the environment and the defaults. Repeated calls merge. |

Leading and trailing slashes in folder paths are removed, so `'/app/Alt/'` means `app/Alt` inside the application
root. Folders are always relative to the application root.

### init()

```ts
init(): Promise<express.Router>
```

Resolves global middleware, middleware, controllers and models, then registers every recorded route on a new
`express.Router` and resolves to it. Calling `init()` again returns the same promise, and therefore the same router.

A rejected `init()` is not cached. After a failure you can fix the cause (create the missing file, change
`config()`, declare more routes) and call `init()` again; it builds a new router from scratch.

`init()` rejects with an `Error` that names the route when something cannot be resolved:

| Problem | Message (abbreviated) |
| --- | --- |
| Controller file missing | `route GET /x: controller file not found: <abs path>` |
| Controller file fails to import | `route GET /x: failed to load controller <abs path>: <cause>` (original error on `err.cause`) |
| Controller method missing | `route GET /x: method "show" not found on controller UserController (<abs path>)` |
| Middleware file missing | `route GET /x: middleware file not found: <abs path>` |
| Middleware has no method | `route GET /x: middleware Auth (<abs path>) has no "handle" method` |
| Middleware entry of a wrong type | `route GET /x: invalid middleware <value>` (`TypeError`) |
| Model file missing | `route GET /x: model file not found: <abs path>` |
| Model hooks missing | `route GET /x: model Teacher (<abs path>) is missing mapRequest` (only the hooks the route's verbs use; see [crud() model hooks](#crud-model-hooks)) |
| Invalid Express path | `route GET /posts/:id? (PostController@show): invalid path "/posts/:id?": <Express message>` (original error on `err.cause`) |

All messages start with `[@averoa/routes]`. For global middleware the route is shown as
`MiddlewareProvider.beginning()` or `MiddlewareProvider.end()`. For an invalid path the message names the verb, the
full path and the handler (a `'Controller@method'` string, `function <name>` or `anonymous function`); see
[Paths and Express 5 syntax](#paths-and-express-5-syntax).

### doc(meta) and describe()

`doc(meta)` attaches API documentation to the route declared just before it and returns the router;
`describe()` returns the metadata of every route once `init()` has resolved. See
[Route metadata and documentation](#route-metadata-and-documentation).

### Properties

After declaration, `router.routes` holds the recorded route definitions (verbs, full path, handler, middleware,
model), and after `init()` resolves, `router.router` holds the built `express.Router`. They are useful for
inspection and tests; change them only through the methods above.

## Handler order

Every registered route runs the same chain. Each step is wrapped so that a thrown error or a rejected promise is
passed to `next(err)`.

```text
request
  │
  ├─ 1. MiddlewareProvider.beginning()   global, from app/Providers/index.js
  ├─ 2. scope middleware                 outer scope first, then inner
  ├─ 3. route middleware                 the route's own array, in order
  ├─ 4. MiddlewareProvider.end()         global
  ├─ 5. multipart parsing (multer)       *Form routes only
  ├─ 6. crud model hooks                 inside crud()/set() only
  │       checkParamId → validationRouter → mapRequest
  └─ 7. controller
```

Consequences:

- Middleware that rejects a request (authentication, rate limiting) runs before any upload is read, so an
  unauthenticated client cannot make the server buffer files.
- On `*Form` routes, `req.files` and the multipart `req.body` are **not** available in global, scope or route
  middleware. Read them in model hooks or in the controller.
- Middleware is not de-duplicated: the same middleware in an outer and an inner scope runs twice.
- Global middleware is part of each route's chain, not a `router.use()`: it runs only for requests that match a
  route, once per matched route.

## Controller resolution

`'Name@method'` loads `<controller.path>/Name.js` and takes its default export, or the named export called `Name`
when there is no default export. `Name` may contain subfolders: `'Admin/UserController@index'` loads
`app/Controllers/Admin/UserController.js`.

| The export is | What is called | `this` |
| --- | --- | --- |
| An instance or plain object (`export default new UserController()`) | `exported.method` | the object |
| A class with a **static** `method` (`static async index() {}`) | the static method; the class is never instantiated | the class |
| A class with an instance `method` (`export default UserController`) | `method` on an instance created once (no constructor arguments) and reused for every route of this router | the instance |
| A constructor function with `method` on its prototype | same as a class | the instance |

A plain function export is not a controller. To use a function as a handler, pass the function itself:
`router.get('/health', (req, res) => res.json({ ok: true }))`. Function handlers are used as they are.

Files are imported once per router definition. Every problem (missing file, failed import, missing method) is
reported by `init()`, not at request time.

## Middleware resolution

Middleware entries in `middleware()`, `group()` and route arrays are resolved with the configured method name
(`handle` by default):

| Entry | Resolved to |
| --- | --- |
| A string `'Name'` | `<middleware.path>/Name.js`, default export or named export `Name`, then resolved by the rules below. Subfolders work as for controllers. |
| An instance or object with the method | that method, bound to the object |
| A class with a static method | the static method; the class is never instantiated, `this` is the class |
| A class with an instance method | the method of an instance created once per router and reused for every route that lists the class, whether by file name or inline |
| A plain function `(req, res, next)` | used as is |

A middleware file that exports a plain function is used as is. Anything else (for example a class without the
method) makes `init()` reject.

Express error handlers keep their four arguments. A function `(err, req, res, next)`, or an object or class whose
middleware method takes four arguments (`handle(err, req, res, next)`), is skipped while there is no error and
called with the error when an earlier middleware passes one to `next(err)` or throws. It can answer the request or
call `next(err)` to pass the error on. Only middleware entries are checked this way; the controller and the crud model
hooks are always called with `(req, res, next)`.

```js
const fail = (req, res, next) => next(Object.assign(new Error('Forbidden'), { status: 403 }));
const asJson = (err, req, res, next) => res.status(err.status ?? 500).json({ message: err.message });

router.get('/reports', 'ReportController@index', [fail, asJson]); // 403 {"message":"Forbidden"}
```

### Global middleware

Global middleware is read once, during `init()`, from the `MiddlewareProvider` named export of
`app/Providers/index.js`. The file and both methods are optional.

```js
// app/Providers/index.js
export { default as MiddlewareProvider } from './MiddlewareProvider.js';

// app/Providers/MiddlewareProvider.js
class MiddlewareProvider {
  beginning() {
    return ['RequestIdMiddleware'];          // before scope and route middleware
  }

  end() {
    return [(req, res, next) => next()];      // after route middleware
  }
}

export default new MiddlewareProvider();
```

- `beginning()` and `end()` return an array of middleware entries, or nothing (`undefined` means none). They may be
  `async` (the returned promise is awaited at `init()`); any other return value makes `init()` reject.
- `MiddlewareProvider` may be an instance, an object, a class with static `beginning()`/`end()` (used as is), or a
  class with instance methods (instantiated once).
- Entries follow the table above, but always use the `handle` method and the `middleware.path` folder.
- The methods are called once per router definition at `init()`, not per request. With `@averoa/core`, the API and
  the web router each call them once.

## crud() model hooks

`crud(model, prefix, callback)` (and its alias `set()`) prefixes the routes declared in `callback` and runs hooks of
the model `<model.path>/<model>.js` (default export, or the named export called `model`) before the controller.

```js
router.crud('Teacher', 'teachers', () => {
  router.get('/', 'TeacherController@findAll');     // GET    /teachers
  router.get('/:id', 'TeacherController@findOne');  // GET    /teachers/:id
  router.post('/', 'TeacherController@create');     // POST   /teachers
  router.put('/:id', 'TeacherController@update');   // PUT    /teachers/:id
  router.delete('/:id', 'TeacherController@delete'); // DELETE /teachers/:id
});
```

The model must define, as functions (normally static methods), the hooks that the routes in the scope actually use:
`checkParamId` and `mapRequest` for `get` and `delete`, plus `validationRouter` for `post`, `put`, `patch` and their
`*Form` variants (see the table below). `all()`, `head` and `options` routes use no hooks, but the model file must
still exist. A missing hook that a route needs makes `init()` reject. Each hook is called as

```js
Model[hook].call(Model, req, res, next, additional)
```

so `this` is the model class. A hook ends the chain by sending a response instead of calling `next()`.

Which hooks run, and the `additional` argument they receive, depends on the verb:

| Route | Hooks | `additional.type` | `additional.create` |
| --- | --- | --- | --- |
| `post` | `checkParamId` → `validationRouter` → `mapRequest` | `'json'` | `true` |
| `postForm` | `checkParamId` → `validationRouter` → `mapRequest` | `'multipart'` | `true` |
| `put`, `patch` | `checkParamId` → `validationRouter` → `mapRequest` | `'json'` | `false` |
| `putForm`, `patchForm` | `checkParamId` → `validationRouter` → `mapRequest` | `'multipart'` | `false` |
| `get`, `delete` | `checkParamId` → `mapRequest` | `'json'` | `false` |
| `all`, and `head`/`options` via `match()` | none | | |

`match()` and `any()` register one route per verb, and each verb gets the hooks from this table.

The full shape is:

```js
{
  type: 'json' | 'multipart', // 'multipart' only for postForm, putForm, patchForm
  create: boolean,            // true only for POST
  pref: string,               // every enclosing prefix, slashes removed
}
```

`pref` is built from all enclosing prefixes, including the `crud()` prefix, without the route's own `uri`: inside
`group({ prefix: 'admin' })` and `crud('Teacher', 'teachers')` it is `'adminteachers'`, and `crud('Teacher', cb)`
with no prefix at all gives `''`. The `Model` class of `@averoa/utilities` uses it as the upload folder name. Each
hook receives its own copy of the object.

When `crud()` scopes are nested, the innermost model is used. Routes outside the scope get no hooks.

The [`Model` class of `@averoa/utilities`](https://github.com/budiherma1/AveroaUtilities) implements these hooks:
`checkParamId` answers 404 when `req.params.id` does not exist, `validationRouter` answers 422 when the body fails
validation, and `mapRequest` sets `req.dataReq` (plus `req.isFormData` for
multipart routes and `req.routeData` from `pref`). Any class with the three methods works.

## Uploads

`postForm`, `putForm` and `patchForm` parse `multipart/form-data` with one [multer 2](https://github.com/expressjs/multer)
instance per router, configured with **memory storage** and `.any()`:

- `req.files` is an array of every uploaded file, whatever the field name. Each file has `fieldname`,
  `originalname`, `mimetype`, `size` and `buffer` (the content is held in memory; nothing is written to disk).
- `req.body` holds the text fields.
- A request that is not `multipart/form-data` is passed through unparsed: `req.files` is not set, and `req.body` is
  whatever the app's own body parsers produced.

Parsing happens after all middleware (see [Handler order](#handler-order)).

### Limits

| Limit | Default | Override |
| --- | --- | --- |
| `fileSize` | 10 MB (`10485760` bytes) | env `UPLOAD_MAX_FILE_SIZE`, or `config({ upload: { limits: { fileSize } } })` |
| `files` | `10` | env `UPLOAD_MAX_FILES`, or `config({ upload: { limits: { files } } })` |
| `fields` | `100` | `config({ upload: { limits: { fields } } })` |
| `fieldSize` | 1 MB (`1048576` bytes) | `config({ upload: { limits: { fieldSize } } })` |
| `parts` | `files + fields` of the effective limits (`110` by default) | `config({ upload: { limits: { parts } } })` |

Precedence is `config({ upload: { limits } })` → environment → `DEFAULT_UPLOAD_LIMITS`. `config()` accepts any
multer limit key (for example `fieldNameSize` or `headerPairs`). Limits are computed when `init()` runs.

`resolveUploadLimits(configured)` returns the effective limits for a given `configured` object, using the current
environment:

```js
import { resolveUploadLimits } from '@averoa/routes';

resolveUploadLimits();
// { fileSize: 10485760, files: 10, fields: 100, fieldSize: 1048576, parts: 110 }

resolveUploadLimits({ files: 5 });
// { fileSize: 10485760, files: 5, fields: 100, fieldSize: 1048576, parts: 105 }
```

### Upload errors

When a limit is exceeded, multer's `MulterError` is passed to `next(err)` with `err.code` set by multer, plus:

| `err.code` | `err.status` |
| --- | --- |
| `LIMIT_FILE_SIZE` | `413` |
| any other `MulterError` code (`LIMIT_FILE_COUNT`, `LIMIT_FIELD_COUNT`, `LIMIT_FIELD_VALUE`, `LIMIT_PART_COUNT`, ...) | `400` |

`err.expose` is set to `true`, so error handlers that respect it (such as the one in `@averoa/core`) can show the
message and code to the client.

A malformed multipart body (for example a truncated form, a missing boundary or a broken part header) makes the
multipart parser fail with a plain `Error` (`Unexpected end of form`, `Multipart: Boundary not found`, ...). It is
passed to `next(err)` with `err.status` `400` and `err.expose` `true` as well, so it is answered as a bad request, not
as a server error. Any error that already has a `status` or `statusCode` keeps it.

## Configuration

Environment variables read by this package:

| Variable | Default | Description |
| --- | --- | --- |
| `UPLOAD_MAX_FILE_SIZE` | `10485760` | Maximum size of one uploaded file on `*Form` routes, in bytes. |
| `UPLOAD_MAX_FILES` | `10` | Maximum number of files per `*Form` request. |
| `AVEROA_ROOT` | nearest `package.json` at or above `process.cwd()` | Application root, read through `@averoa/utilities/paths`. |

```env
UPLOAD_MAX_FILE_SIZE=5242880
UPLOAD_MAX_FILES=4
```

The upload variables must be positive numbers; empty or invalid values (such as `10mb`) are ignored and the default
is used. `config({ upload: { limits } })` overrides both.

Everything else is set with [`config()`](#configoptions).

## Scopes

- **Callbacks must be synchronous.** `group()`, `prefix()`, `middleware()`, `crud()` and `set()` throw
  `scope callbacks must be synchronous` when the callback returns a Promise (for example an `async` callback).
  Routes declared after an `await` would otherwise lose the scope's prefix, middleware and model. Load what you need
  before declaring routes (top-level `await` in the routes file) and pass a plain function.
- **Scopes nest.** Prefixes are joined outer to inner, middleware runs outer to inner, and the innermost `crud()`
  model wins. The same prefix or middleware may appear at several levels.
- **Scopes are restored** when the callback returns or throws, so a failing callback never leaks its prefix or
  middleware into later routes.
- **The callback receives the router**, which makes it easy to split routes over several files:

```js
// routes/api.js
import Router from '@averoa/routes';
import v2 from './v2/index.js';

const router = Router();
router.prefix('/v2', () => v2(router));
export default router;

// routes/v2/index.js
export default function v2(router) {
  router.prefix('teachers', () => {
    router.get('/', 'TeacherController@findAll'); // GET /v2/teachers
  });
}
```

- A `prefix` of `''`, `null` or `undefined` adds no prefix. `group()` without `middleware` adds no middleware.
- A callback that is not a function throws a `TypeError`.

## Paths and Express 5 syntax

The full path of a route is the enclosing prefixes plus `uri`, joined with `/` and normalised:

- Leading slashes are optional: `prefix('admin')` and `prefix('/admin')` are the same, and so are `get('x')` and
  `get('/x')`.
- Repeated slashes are collapsed and a trailing slash is removed: `crud('Teacher', 'teachers', ...)` with
  `get('/', ...)` registers `/teachers`. Express routers are not strict by default, so `/teachers/` still matches.
- `uri` must be a string. Regular expressions and arrays of paths are not supported.

Paths use the Express 5 (path-to-regexp 8) syntax:

| You want | Express 5 | No longer valid |
| --- | --- | --- |
| Wildcard | `/files/*splat` (`req.params.splat` is an array of segments) | `/files/*` |
| Wildcard that also matches the bare path | `/files{/*splat}` | |
| Optional parameter | `/posts{/:id}` | `/posts/:id?` |
| Optional suffix | `/report{.:ext}` | |

An invalid path makes `init()` reject with an error that names the route and the handler, followed by the Express
message, and keeps the error thrown by Express on `err.cause`:

```text
[@averoa/routes] route GET /:id? (PostController@show): invalid path "/:id?": Unexpected ? at index 4: /:id?; visit https://git.new/pathToRegexpError for info
```

See the [Express 5 migration guide](https://expressjs.com/en/guide/migrating-5.html) for the full list of path changes.

## Route metadata and documentation

### describe()

```ts
describe(): Array<RouteDescription>
```

Once `init()` has resolved, `describe()` returns one entry per verb (and per path variant, see below), in
registration order. It is what `@averoa/core` uses to build the OpenAPI document; it is also handy for route listings
and tests. Calling it before `init()` has resolved throws. Every call returns fresh copies.

```js
await router.init();
router.describe();
// [{
//   method: 'put',
//   path: '/teachers/:id',
//   openapiPath: '/teachers/{id}',
//   params: [{ name: 'id', wildcard: false }],
//   handler: 'TeacherController@update',
//   middleware: ['AuthMiddleware'],
//   middlewareEntries: ['AuthMiddleware'],
//   model: 'Teacher',
//   modelClass: [class Teacher],
//   hooks: ['checkParamId', 'validationRouter', 'mapRequest'],
//   form: false,
//   doc: null,
// }, ...]
```

| Field | Description |
| --- | --- |
| `method` | Lower-case verb (`get`, `post`, ..., or `all` for `all()`). |
| `path` | Full Express path, prefixes included (relative to where the router is mounted, e.g. without `/api`). |
| `openapiPath` | The same path as an OpenAPI template (`{id}`). |
| `params` | Path parameters of `openapiPath`; `wildcard` is `true` for `*name` parameters. |
| `handler` | `'Controller@method'`, the function's name, or `'anonymous'`. |
| `middleware` | Names of the whole middleware chain in run order: `MiddlewareProvider.beginning()`, scope and route middleware, `MiddlewareProvider.end()`. A string entry is its own name; a function or class gives its `name`; an object its constructor's name; otherwise `'anonymous'`. |
| `middlewareEntries` | The same chain as declared (strings, functions, objects), e.g. to read metadata a middleware function carries. |
| `model`, `modelClass` | The `crud()` model name and the resolved class, or `null`. |
| `hooks` | Model hooks run for this verb (`[]` outside `crud()`). |
| `form` | `true` for `postForm` / `putForm` / `patchForm` (multipart). |
| `doc` | The object given to `doc()`, or `null`. |

### doc(meta)

Chain `doc()` after a route to attach documentation. It applies to the route declared just before it; several calls
merge. It doesn't change routing, and calling it before any route or after `init()` throws.

```js
router.post('/auth/login', 'AuthController@login').doc({
  summary: 'Log in with email and password',
  tags: ['Auth'],
  responses: { 401: { description: 'Invalid email or password' } },
});
```

The router stores the object as is. `@averoa/core` reads `summary`, `description`, `tags`, `operationId`,
`deprecated`, `security`, `request`, `responses` and `exclude` from it; see its README for the meaning of each key.

### OpenAPI paths

`toOpenApiPaths(path)` (also used by `describe()`) converts Express 5 syntax: `:id` and `:"quoted-name"` become
`{id}`, a wildcard `*path` becomes `{path}` (flagged `wildcard: true`), escaped characters (`\\:`) are kept literally.
OpenAPI has no optional path segments, so each `{optional}` group gives two variants, shortest first:

```js
toOpenApiPaths('/files{/:name}');
// [{ path: '/files', params: [] }, { path: '/files/{name}', params: [{ name: 'name', wildcard: false }] }]
```

## TypeScript

The package ships hand-written declarations (`index.d.ts`) for the whole API; the runtime is unchanged plain
JavaScript. They are self-contained: no `@types/express` or `@types/node` is needed. Handler strings are checked as
`'Controller@method'`, and a scope callback that returns a Promise (an `async` callback) is a type error.

`req` and `res` are `any` by default. To type inline handlers with Express's types (from `@types/express`), pass
them to `Router()`:

```ts
import Router, { type ErrorRequestHandler } from '@averoa/routes';
import type { Request, Response } from 'express';

const router = Router<Request, Response>();
router.get('/:id', (req, res) => { res.json({ id: req.params.id }); });

// annotate error handlers: an inline (err, req, res, next) lambda in a middleware array is not contextually typed
const onError: ErrorRequestHandler = (err, req, res, next) => res.status(err.status ?? 500).end();
```

`init()` resolves to a structural `BuiltRouter` (a request handler with `stack`), which `app.use()` accepts; cast it
to `import('express').Router` if you need the rest of the Express Router API.

## Testing

```bash
npm install
npm test            # node --test
npm run lint        # ESLint (eslint.config.js)
npm run typecheck   # tsc against index.d.ts and the usage files in test/types/
```

The suite uses the Node.js test runner (`node --test`) and starts real Express servers on ephemeral ports against
the fixture applications in `test/fixtures/`. The `pretest` script links `@averoa/utilities/paths` from a sibling
`../AveroaUtilities` checkout (or `$AVEROA_UTILITIES_DIR`) when `@averoa/utilities` is not installed.

Issues and pull requests are welcome at [github.com/budiherma1/AveroaRoute](https://github.com/budiherma1/AveroaRoute).
Please run `npm test`, `npm run lint` and `npm run typecheck` before opening a pull request.

GitHub Actions (`.github/workflows/ci.yml`) runs `npm run lint`, `npm run typecheck` and `npm test` on Node.js 20, 22 and 24 against the published sibling
packages (dev dependencies). `.github/workflows/release.yml` publishes to npm when a `vX.Y.Z` tag matching
`package.json` is pushed, after the same checks; it needs an `NPM_TOKEN` repository secret.

## Upgrading from 2.x

3.0.0 is a rewrite: routes are no longer generated as source strings and run with `eval`. The complete list, with
before and after behaviour, is in [CHANGELOG.md](CHANGELOG.md). The breaking changes in short:

- **Express 5 and `@averoa/utilities@^2` are peer dependencies.** Paths use the Express 5 syntax. App files are found
  through `@averoa/utilities/paths` instead of paths relative to `node_modules` (this fixes pnpm, workspaces,
  symlinks and monorepos), and `@averoa/providers` is no longer imported.
- **Scope middleware no longer replaces route middleware.** Both run: scope middleware first, then the route's own.
- **`crud()` `POST` is no longer multipart.** Only `postForm`, `putForm` and `patchForm` are. Every hook receives the
  same `additional` object `{ type, create, pref }`.
- **Errors at `init()`.** Missing controllers, methods, middleware and model hooks reject `init()`; a handler string
  without `@` throws when the route is declared.
- **Multer runs after all middleware.** `req.files` and multipart `req.body` are no longer available in middleware
  on `*Form` routes.
- **Uploads are limited** by default (10 MB per file, 10 files, 100 fields, 1 MB per field).
- **Scope callbacks must be synchronous.**
- **Global middleware is resolved once** at `init()`, not on every request.
- Adding a route after `init()` throws, and trailing slashes are normalised.

Migration steps:

1. Upgrade the app to Express 5, `@averoa/utilities@^2` and `@averoa/core@^2`.
2. Remove route middleware that duplicated the middleware of its enclosing `middleware()` or `group()` scope.
3. Switch a JSON `POST` inside `crud()` that relied on `req.isFormData === true` to `postForm`, or stop checking
   the flag.
4. Raise the upload limits with `UPLOAD_MAX_FILE_SIZE`, `UPLOAD_MAX_FILES` or `config({ upload: { limits } })` if you
   accept larger or more files, more fields, or larger text fields.
5. Move logic that read `req.files` or a multipart `req.body` in middleware into a model hook or the controller.
6. Make `async` scope callbacks synchronous.
7. Update paths to the Express 5 syntax (`/*` becomes `/*splat`, `/:id?` becomes `{/:id}`).
8. Start the app once: any typo in a `'Controller@method'` string now fails at startup with the route named.

## Related packages

| Package | Description | Links |
| --- | --- | --- |
| `averoajs` | The application boilerplate; start here. Not published to npm. | [GitHub](https://github.com/budiherma1/averoajs) |
| `@averoa/core` | Builds the Express 5 app (security headers, sessions, CSRF, CORS, views, routes, error handling) and the `averoa` CLI. | [npm](https://www.npmjs.com/package/@averoa/core) · [GitHub](https://github.com/budiherma1/AveroaCore) |
| `@averoa/utilities` | Model, Crud, FilterSearch, DB, Mail, Queue, View, Log, and the app path helpers used by this router. | [npm](https://www.npmjs.com/package/@averoa/utilities) · [GitHub](https://github.com/budiherma1/AveroaUtilities) |
| `@averoa/routes` | This package. | [npm](https://www.npmjs.com/package/@averoa/routes) · [GitHub](https://github.com/budiherma1/AveroaRoute) |

## License

[MIT](https://opensource.org/licenses/MIT) © Budi Hermawan
