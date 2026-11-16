# Changelog

## Unreleased

### Added

- **`router.describe()`**: route metadata once `init()` has resolved: one entry per verb with the method, the full
  Express path and its OpenAPI template (`/teachers/{id}`), path parameters, the handler name, the names of the whole
  middleware chain (`MiddlewareProvider` beginning/end included) and the declared entries, the `crud()` model name and
  class, the model hooks, the multipart flag and the route's documentation.
- **`.doc(meta)`**: attach API documentation (`summary`, `tags`, `request`, `responses`, ...) to the route declared
  just before it: `router.post('/login', 'AuthController@login').doc({ summary: 'Log in' })`. Routing is unchanged
  and every existing call keeps working.
- **`toOpenApiPaths(path)`**: converts Express 5 paths (`:id`, `*splat`, `:"quoted"`, `{optional}` groups) to
  OpenAPI path templates.
- **TypeScript declarations** (`index.d.ts`, wired through `"types"` and a `types` condition in `exports`) for the
  whole public API: `Router()`, every route and scope method, `.doc()`, `describe()`, `init()`, `config()` and the
  upload helpers. They need no `@types/express` or `@types/node`; `Router<Request, Response>()` opts in to typed
  `req`/`res`. The JavaScript runtime is unchanged.

### Changed

- **Removed the repository `.npmrc` (`legacy-peer-deps=true`).** `@averoa/utilities@^2` is published, so
  `npm install` now installs the peer dependency normally; the `pretest` shim only kicks in when it is missing.
  Development only; the published package is unchanged.
- **Development: ESLint and type checks.** `npm run lint` (ESLint 10 flat config, the AveroaJS app's rules) and
  `npm run typecheck` (`tsc` over `test/types/`) run in CI next to `npm test`. Changes made to satisfy the linter (line
  wrapping, `crud(model, cb)` without reassigning parameters, renamed test locals) do not change behaviour.

## 3.0.1

### Fixed

- **Malformed multipart bodies are a 400.** On `postForm`/`putForm`/`patchForm`
  routes, a parse error from the multipart parser (truncated form, missing
  boundary, broken part header) was passed on as a plain `Error` without a
  status, so it became a 500. It now gets `status` 400 and `expose: true`, like
  the other multer errors. `LIMIT_FILE_SIZE` stays 413, and an error that
  already has a `status` or `statusCode` keeps it.
- **Error-handling middleware works in middleware arrays.** A
  `(err, req, res, next)` function, or an object/class whose middleware method
  takes four arguments, was wrapped as `(req, res, next)`, so Express called it
  as normal middleware. Four-argument middleware now stays four-argument: it
  is skipped without an error and called with the error after an earlier
  middleware fails. This applies to scope, route and `MiddlewareProvider`
  middleware.
- **Invalid paths name the route.** An invalid Express path (for example
  `/:id?`) made `init()` reject with Express's own error, which does not say
  which route it came from. `init()` now rejects with
  `route GET /:id? (Controller@method): invalid path "/:id?": <Express message>`
  and the original error on `err.cause`.
- **Inline middleware classes are instantiated once per router.** A class
  passed in a middleware array was instantiated once for every route that
  listed it. Instances are now cached per class for the whole router, shared
  with the same class loaded from a middleware file.
- **`init()` can be retried after a failure.** A rejected `init()` was cached:
  every later call returned the same rejection and new routes could not be
  added. Now, after a rejection, routes can be fixed or added and `init()`
  builds a new router. A middleware/controller/model file whose import failed
  is imported again on the retry. Once `init()` succeeds it is cached as
  before, and adding routes while it runs or after it resolves still throws.
- **`crud()`/`set()` only require the hooks that are used.** A model had to
  define `checkParamId`, `validationRouter` and `mapRequest` even when the
  scope only had `get`/`delete`/`all()` routes. Now each route requires only
  the hooks of its verbs: `checkParamId` + `mapRequest` for `get`/`delete`,
  all three for `post`/`put`/`patch` (and `*Form`), none for `all()`/`head`/
  `options`. The model file must still exist.
- `MiddlewareProvider.beginning()`/`end()` may now be `async`. Previously a returned promise crashed `init()` with `(list ?? []) is not iterable`; a non-array return value now rejects with a clear message.

### Changed

- **Node.js 20 or newer.** `engines.node` is now `>=20` (was `>=18.17`), matching
  the peer dependency `@averoa/utilities@^2`, which already required Node.js 20.

## 3.0.0

Rewrite. Routes are no longer built as source strings and run with `eval`;
`init()` registers real closures on an `express.Router`.

### Breaking changes

- **Express 5.** `express@^5` is now a peer dependency (it was an implicit
  dependency before). Path syntax follows Express 5 / path-to-regexp 8
  (for example `*` wildcards must be named: `/*splat`).
- **`@averoa/utilities@^2` is a peer dependency.** App files are located with
  `@averoa/utilities/paths` (`AVEROA_ROOT` env, or the nearest `package.json`
  above `process.cwd()`), not with `./../../..` relative to `node_modules`.
  This fixes pnpm, workspaces, symlinks and monorepos. `@averoa/providers` is no
  longer imported; global middleware is read from `app/Providers/index.js`
  (`MiddlewareProvider` export), which is optional.
- **Scope middleware no longer replaces route middleware.** In 2.x, a route's
  own middleware array was silently ignored inside `middleware()`/`group()`.
  Now both run: scope middleware (outer to inner), then the route's own.
- **crud(): `POST` is no longer forced to multipart.** Only `postForm`,
  `putForm` and `patchForm` are multipart. Every model hook (`checkParamId`,
  `validationRouter`, `mapRequest`) now receives the same `additional` object
  `{ type: 'json' | 'multipart', create: boolean, pref: string }`; `create` is
  true for POST only. In 2.x, get/delete hooks got no `additional`, and
  put/patch JSON routes got `undefined`.
- **Errors at `init()` instead of at request time.** A missing controller file,
  controller method, middleware file/method or model hook rejects `init()`
  with an Error naming the route (`route GET /users/:id: method "show" not found
  on controller UserController (...)`). A handler string without `@` throws as
  soon as the route is declared.
- **Handler order on every route:** global `MiddlewareProvider.beginning()` →
  scope middleware (outer to inner) → route middleware → global
  `MiddlewareProvider.end()` → multipart parsing (*Form routes only) → crud
  model hooks (`checkParamId`, `validationRouter`, `mapRequest`) → controller.
  In 2.x and early 3.0 builds multer parsed the upload *before* any
  middleware, so an unauthenticated request could make the server buffer
  files in memory. Now `req.files` / multipart `req.body` are **not** available
  in global or route middleware on *Form routes; read them in model hooks or the
  controller. Middleware that rejects the request (auth) stops it before any
  upload is read.
- **Uploads are limited.** *Form routes use one multer 2 instance with memory
  storage and these default limits (`DEFAULT_UPLOAD_LIMITS`):
  `fileSize` 10 MB (env `UPLOAD_MAX_FILE_SIZE`, bytes), `files` 10 (env
  `UPLOAD_MAX_FILES`), `fields` 100, `fieldSize` 1 MB, and `parts` =
  files + fields. `config({ upload: { limits } })` wins over the env and the
  defaults (any multer limit key). Oversized files fail with `MulterError`
  `LIMIT_FILE_SIZE` and `status` 413; other multer limit errors
  (`LIMIT_FILE_COUNT`, `LIMIT_FIELD_COUNT`, `LIMIT_FIELD_VALUE`,
  `LIMIT_PART_COUNT`, ...) get 400.
- **Scope callbacks must be synchronous.** `group()`, `prefix()`,
  `middleware()`, `crud()` and `set()` now throw `scope callbacks must be
  synchronous` when the callback returns a Promise (for example an `async`
  callback). Before, routes declared after an `await` inside the callback were
  silently registered without the scope's prefix, middleware and model hooks.
  Do any async loading before declaring routes (top-level `await` in the routes
  file) and pass a plain function.
- **Global middleware is resolved once** at `init()` instead of calling
  `MiddlewareProvider.beginning()/end()` on every request.
- Adding a route after `init()` throws. `init()` may be called more than once
  and returns the same router.
- Trailing slashes are normalised: `crud('Teacher', 'teachers', () => router.get('/', ...))`
  registers `/teachers` (Express still matches `/teachers/`).

### Fixed

- Nested `prefix()`/`group()`/`middleware()`/`crud()` scopes are kept on a
  stack, so `prefix('/v2', () => prefix('/v2', ...))` and the same middleware
  in an outer and inner group no longer corrupt the outer scope. Scopes are
  restored even when the callback throws.
- Sync throws and rejected promises from controllers, middleware and model
  hooks reach `next(err)`.
- Default-export classes with **static** methods work again, as in 1.x:
  `export default class UserController { static async index(req, res) {} }`.
  A class that has the requested method as a static is used as is (`this` is
  the class) and is never instantiated; otherwise it is instantiated once.
  The same applies to middleware files and middleware classes in route arrays
  (`static handle()`), and to a `MiddlewareProvider` class with static
  `beginning()`/`end()`.

### Added

- Handlers can be functions: `router.get('/', (req, res) => ...)`.
- Middleware arrays accept functions, objects with the middleware method, and
  classes, next to names. A middleware file may export an instance, a class
  (instantiated once) or a plain function.
- Controllers may export an instance (as before), a class (instantiated once,
  `this` bound) or an object with static methods.
- `config({ model: { path } })` and `config({ upload: { limits } })`; every
  `config()` key is optional.
- All route methods return the router, so calls can be chained.
- Named exports `Router`, `AveroaRouter`, `DEFAULT_MAX_FILE_SIZE`,
  `DEFAULT_UPLOAD_LIMITS`, `resolveUploadLimits(limits)`.

### Migration

1. Upgrade the app to Express 5 and `@averoa/utilities@^2`, `@averoa/core@^2`.
2. If you relied on route middleware being ignored inside a `middleware()` or
   `group()` scope, remove the duplicates from the route.
3. If a JSON `POST` inside `crud()` relied on `req.isFormData === true`, switch
   that route to `postForm` (or stop checking the flag).
4. Set `UPLOAD_MAX_FILE_SIZE` / `UPLOAD_MAX_FILES` or
   `config({ upload: { limits: { fileSize, files, fields, fieldSize } } })` if
   you accept files larger than 10 MB, more than 10 files, more than 100
   fields or text fields larger than 1 MB.
5. If a global or route middleware on a *Form route read `req.files` or a
   multipart `req.body`, move that logic into a model hook or the controller
   (multer now runs after all middleware).
6. Make `async` `group()`/`prefix()`/`middleware()`/`crud()` callbacks
   synchronous.
7. Run the app once: any typo in a `'Controller@method'` string now fails at
   startup with the route named in the error.
