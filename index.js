import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import multer from 'multer';
import { appPath, importApp } from '@averoa/utilities/paths';

/**
 * @averoa/routes — Laravel-style route definitions on top of express.Router.
 *
 *   const router = Router();
 *   router.get('/', 'HomeController@index');
 *   router.group({ prefix: 'admin', middleware: ['AuthMiddleware'] }, () => {
 *     router.crud('Users', 'users', () => {
 *       router.get('/', 'UserController@findAll');
 *       router.post('/', 'UserController@create');
 *     });
 *   });
 *   app.use(await router.init());
 *
 * Routes are only *recorded* while you call get/post/...; `init()` resolves
 * controllers, middleware and models from the application (see
 * `@averoa/utilities/paths`) and registers real closures on an express.Router.
 */

/** Default upload limit for *Form routes: 10 MB. */
export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Default multer limits for *Form routes. `fileSize` can be set with env
 * UPLOAD_MAX_FILE_SIZE, `files` with env UPLOAD_MAX_FILES; `parts` defaults to
 * files + fields. Everything can be overridden with config({ upload: { limits } }).
 */
export const DEFAULT_UPLOAD_LIMITS = Object.freeze({
  fileSize: DEFAULT_MAX_FILE_SIZE,
  files: 10,
  fields: 100,
  fieldSize: 1024 * 1024,
});

/** Verbs that receive the full model hook chain inside crud(). */
const WRITE_VERBS = new Set(['post', 'put', 'patch']);
/** Verbs that receive checkParamId + mapRequest inside crud(). */
const READ_VERBS = new Set(['get', 'delete']);
/** Verbs accepted by match(). */
const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all']);

const MODEL_HOOKS = ['checkParamId', 'validationRouter', 'mapRequest'];

/** crud model hooks run for `verb`, in order (none for all/head/options). */
function hooksFor(verb) {
  if (WRITE_VERBS.has(verb)) return MODEL_HOOKS;
  if (READ_VERBS.has(verb)) return ['checkParamId', 'mapRequest'];
  return [];
}

/** True for `class X {}` (as opposed to a plain function). */
function isClass(fn) {
  return typeof fn === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(fn));
}

/**
 * True when `fn[method]` is a static method of `fn` itself (own or inherited
 * from a parent class), not one of Function.prototype's (call, bind, ...).
 */
function hasStatic(fn, method) {
  return typeof fn === 'function'
    && typeof fn[method] === 'function'
    && fn[method] !== Function.prototype[method];
}

/** '/a//b/' -> '/a/b'; '' -> '/'. */
function normalizePath(p) {
  let out = `/${p}`.replace(/\/{2,}/g, '/');
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

/** Turn a configured folder ('app/Controllers', '/app/Controllers/') into an app-relative folder. */
function normalizeFolder(p) {
  return String(p).replace(/^\/+|\/+$/g, '');
}

/** Calls fn(...args) so that a sync throw or an async rejection both reach next(err). */
function invoke(fn, args, next) {
  try {
    const result = fn(...args);
    if (result && typeof result.then === 'function') {
      result.then(undefined, (err) => next(err ?? new Error('Route handler rejected without a reason')));
    }
  } catch (err) {
    next(err);
  }
}

/** Makes sure sync throws and async rejections of `fn` both reach next(err). */
function wrap(fn) {
  const wrapped = function averoaHandler(req, res, next) {
    invoke(fn, [req, res, next], next);
  };
  Object.defineProperty(wrapped, 'name', { value: fn.name || 'averoaHandler' });
  return wrapped;
}

/**
 * Like wrap(), but keeps Express error handlers `(err, req, res, next)` as
 * four-argument functions, so Express still calls them only with an error.
 */
function wrapMiddleware(fn) {
  if (fn.length !== 4) return wrap(fn);
  const wrapped = function averoaErrorHandler(err, req, res, next) {
    invoke(fn, [err, req, res, next], next);
  };
  Object.defineProperty(wrapped, 'name', { value: fn.name || 'averoaErrorHandler' });
  return wrapped;
}

/** 'UserController@show' | function name, for error messages. */
function describeHandler(handler) {
  if (typeof handler === 'string') return handler;
  return handler.name ? `function ${handler.name}` : 'anonymous function';
}

/** Positive number from env `name` (e.g. UPLOAD_MAX_FILE_SIZE), or undefined. */
function envLimit(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * multer limits: config({ upload: { limits } }) > env > DEFAULT_UPLOAD_LIMITS.
 * `parts` (fields + files) defaults to the effective files + fields.
 */
export function resolveUploadLimits(configured = {}) {
  const limits = {
    ...DEFAULT_UPLOAD_LIMITS,
    fileSize: envLimit('UPLOAD_MAX_FILE_SIZE') ?? DEFAULT_UPLOAD_LIMITS.fileSize,
    files: envLimit('UPLOAD_MAX_FILES') ?? DEFAULT_UPLOAD_LIMITS.files,
    ...configured,
  };
  if (limits.parts === undefined) limits.parts = limits.files + limits.fields;
  return limits;
}

export class AveroaRouter {
  constructor() {
    /** App-relative folders and the middleware method name (see config()). */
    this.paths = {
      controller: 'app/Controllers',
      middleware: 'app/Middleware',
      model: 'app/Models',
    };
    this.middlewareMethod = 'handle';
    this.uploadLimits = {};

    /** Recorded route definitions, registered by init(). */
    this.routes = [];

    // Scope stacks: push on enter, pop in finally (nested scopes never corrupt each other).
    this.prefixStack = [];
    this.middlewareStack = [];
    this.modelStack = [];

    this.router = null;
    this.initPromise = null;
    this.moduleCache = new Map();
    /** One instance per class per router (key: the class itself). */
    this.instanceCache = new Map();
  }

  /** Factory used by the default export: `Router()`. */
  static Router() {
    return new this();
  }

  /**
   * Configure folders, the middleware method and upload limits.
   * Every key is optional.
   *
   * @param {object} [options]
   * @param {{path?: string}} [options.controller]  folder of controllers (default 'app/Controllers')
   * @param {{path?: string, method?: string}} [options.middleware]  folder + method name (default 'app/Middleware', 'handle')
   * @param {{path?: string}} [options.model]  folder of models used by crud() (default 'app/Models')
   * @param {{limits?: object}} [options.upload]  multer limits for *Form routes (fileSize, files, fields,
   *   fieldSize, parts, ...); wins over env UPLOAD_MAX_FILE_SIZE / UPLOAD_MAX_FILES and DEFAULT_UPLOAD_LIMITS
   */
  config({ controller, middleware, model, upload } = {}) {
    if (controller?.path) this.paths.controller = normalizeFolder(controller.path);
    if (middleware?.path) this.paths.middleware = normalizeFolder(middleware.path);
    if (middleware?.method) this.middlewareMethod = middleware.method;
    if (model?.path) this.paths.model = normalizeFolder(model.path);
    if (upload?.limits) this.uploadLimits = { ...this.uploadLimits, ...upload.limits };
    return this;
  }

  // ---------------------------------------------------------------- verbs

  /**
   * @param {string} uri
   * @param {string|Function} handler  'Controller@method' or a function (req, res, next)
   * @param {Array<string|Function>} [middleware]
   */
  get(uri, handler, middleware) { return this.add(['get'], uri, handler, middleware); }

  post(uri, handler, middleware) { return this.add(['post'], uri, handler, middleware); }

  put(uri, handler, middleware) { return this.add(['put'], uri, handler, middleware); }

  patch(uri, handler, middleware) { return this.add(['patch'], uri, handler, middleware); }

  delete(uri, handler, middleware) { return this.add(['delete'], uri, handler, middleware); }

  /** POST with multipart/form-data parsing (multer, files in req.files). */
  postForm(uri, handler, middleware) { return this.add(['post'], uri, handler, middleware, { form: true }); }

  putForm(uri, handler, middleware) { return this.add(['put'], uri, handler, middleware, { form: true }); }

  patchForm(uri, handler, middleware) { return this.add(['patch'], uri, handler, middleware, { form: true }); }

  /** Register the same route for several verbs: match(['get', 'post'], uri, handler). */
  match(verbs, uri, handler, middleware) {
    const list = (Array.isArray(verbs) ? verbs : [verbs]).map((v) => String(v).toLowerCase());
    for (const v of list) {
      if (!VERBS.has(v)) throw new Error(`[@averoa/routes] match(): unsupported verb "${v}" for ${uri}`);
    }
    return this.add(list, uri, handler, middleware);
  }

  /** get + post + put + delete + patch. */
  any(uri, handler, middleware) {
    return this.add(['get', 'post', 'put', 'delete', 'patch'], uri, handler, middleware);
  }

  /** express router.all(): every verb, no crud model hooks. */
  all(uri, handler, middleware) { return this.add(['all'], uri, handler, middleware); }

  // ---------------------------------------------------------------- scopes

  /** Apply middleware to every route registered inside `cb`. */
  middleware(names = [], cb) {
    return this.scope({ middleware: names }, cb);
  }

  /** Prefix every route registered inside `cb`. */
  prefix(pref, cb) {
    return this.scope({ prefix: pref }, cb);
  }

  /** group({ middleware, prefix }, cb). */
  group({ middleware, prefix } = {}, cb) {
    return this.scope({ middleware, prefix }, cb);
  }

  /**
   * Prefix + attach model hooks (checkParamId / validationRouter / mapRequest)
   * of app/Models/<model>.js to every route registered inside `cb`.
   */
  crud(model, pref, cb) {
    if (typeof pref === 'function') { cb = pref; pref = ''; }
    return this.scope({ model, prefix: pref }, cb);
  }

  /** Alias of crud(). */
  set(model, pref, cb) {
    return this.crud(model, pref, cb);
  }

  /**
   * @private push scope, run cb, pop in finally. The callback must be
   * synchronous: routes declared after an `await` would run once the scope was
   * already popped and silently lose its prefix/middleware/model.
   */
  scope({ prefix, middleware, model }, cb) {
    if (typeof cb !== 'function') throw new TypeError('[@averoa/routes] scope callback must be a function');
    const hasPrefix = prefix !== undefined && prefix !== null && prefix !== '';
    const hasMiddleware = middleware !== undefined && middleware !== null;
    const hasModel = typeof model === 'string' && model !== '';

    if (hasPrefix) this.prefixStack.push(String(prefix));
    if (hasMiddleware) this.middlewareStack.push(Array.isArray(middleware) ? middleware : [middleware]);
    if (hasModel) this.modelStack.push(model);
    let result;
    try {
      result = cb(this);
    } finally {
      if (hasModel) this.modelStack.pop();
      if (hasMiddleware) this.middlewareStack.pop();
      if (hasPrefix) this.prefixStack.pop();
    }
    if (result && typeof result.then === 'function') {
      // The scope is already gone; avoid a second, confusing unhandled rejection.
      result.then(undefined, () => {});
      const where = [
        hasPrefix ? `prefix "${prefix}"` : null,
        hasModel ? `model "${model}"` : null,
        hasMiddleware ? 'middleware' : null,
      ].filter(Boolean).join(', ');
      throw new Error(
        `[@averoa/routes] scope callbacks must be synchronous (${where || 'scope'}): `
        + 'group()/prefix()/middleware()/crud()/set() callbacks returned a Promise, so routes declared after '
        + 'an `await` would lose the prefix and middleware. Load what you need before declaring routes '
        + '(e.g. top-level await) and pass a plain function.',
      );
    }
    return this;
  }

  // ---------------------------------------------------------------- recording

  /** @private record a route; resolution happens in init(). */
  add(verbs, uri, handler, middleware, { form = false } = {}) {
    if (this.initPromise) {
      throw new Error(`[@averoa/routes] cannot add ${verbs.join('|').toUpperCase()} ${uri} after init()`);
    }
    const prefix = this.prefixStack.join('/');
    const fullPath = normalizePath(`${prefix}/${uri ?? ''}`);
    const label = `${verbs.join('|').toUpperCase()} ${fullPath}`;

    if (typeof handler === 'string') {
      const [controller, method, extra] = handler.split('@');
      if (!controller || !method || extra !== undefined) {
        throw new Error(`[@averoa/routes] route ${label}: handler "${handler}" must look like "Controller@method"`);
      }
    } else if (typeof handler !== 'function') {
      throw new TypeError(`[@averoa/routes] route ${label}: handler must be "Controller@method" or a function`);
    }

    let routeMiddleware = [];
    if (middleware !== undefined && middleware !== null) {
      routeMiddleware = Array.isArray(middleware) ? middleware : [middleware];
    }

    this.routes.push({
      verbs,
      path: fullPath,
      label,
      handler,
      middleware: [...this.middlewareStack.flat(), ...routeMiddleware],
      model: this.modelStack.length ? this.modelStack[this.modelStack.length - 1] : null,
      // Upload folder name used by the model hooks: the full prefix without slashes.
      pref: prefix.split('/').join(''),
      form,
    });
    return this;
  }

  // ---------------------------------------------------------------- init

  /**
   * Resolve everything and build the express.Router. Safe to call twice
   * (returns the same router). Rejects with a clear Error when a controller,
   * method, middleware or model cannot be found, or a path is invalid; after
   * a rejection, routes can be added again and init() retried.
   *
   * @returns {Promise<import('express').Router>}
   */
  init() {
    if (!this.initPromise) {
      // A failed init() is not cached: fix or add routes and call init() again.
      const promise = this.build().catch((err) => {
        if (this.initPromise === promise) this.initPromise = null;
        throw err;
      });
      this.initPromise = promise;
    }
    return this.initPromise;
  }

  /** @private */
  async build() {
    const router = express.Router();
    const upload = this.createUpload();
    const { beginning, end } = await this.resolveGlobalMiddleware();

    for (const route of this.routes) {
      const middleware = [];
      for (const m of route.middleware) {
        middleware.push(await this.resolveMiddleware(m, route.label));
      }
      const controller = await this.resolveHandler(route.handler, route.label);
      const model = route.model ? await this.resolveModel(route.model, route.label, route.verbs) : null;

      for (const verb of route.verbs) {
        // Order: global beginning -> scope/route middleware -> global end ->
        // multipart parsing -> crud model hooks -> controller. Multer runs only
        // after auth middleware let the request through (no unauthenticated
        // uploads buffered in memory). Middleware keeps its arity, so an error
        // handler (err, req, res, next) in a middleware array stays one.
        const chain = [...beginning, ...middleware, ...end].map(wrapMiddleware);
        if (route.form) chain.push(wrap(upload));
        if (model) chain.push(...this.modelHooks(model, verb, route).map(wrap));
        chain.push(wrap(controller));
        try {
          router[verb](route.path, ...chain);
        } catch (cause) {
          throw new Error(
            `[@averoa/routes] route ${verb.toUpperCase()} ${route.path} (${describeHandler(route.handler)}): `
            + `invalid path "${route.path}": ${cause.message}`,
            { cause },
          );
        }
      }
    }

    this.router = router;
    return router;
  }

  /**
   * @private one multer instance (memory storage) for every *Form route.
   * MulterError LIMIT_FILE_SIZE -> 413; any other MulterError and every
   * multipart parse error from busboy (malformed body, missing boundary,
   * truncated form) -> 400. Errors that already carry a status keep it.
   */
  createUpload() {
    const limits = resolveUploadLimits(this.uploadLimits);
    const any = multer({ storage: multer.memoryStorage(), limits }).any();
    return function averoaUpload(req, res, next) {
      any(req, res, (err) => {
        if (err && typeof err === 'object' && err.status === undefined && err.statusCode === undefined) {
          err.status = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
          err.expose = true;
        }
        next(err);
      });
    };
  }

  /** @private crud hook chain for one verb, each called with this = model class. */
  modelHooks(model, verb, route) {
    const additional = {
      type: route.form ? 'multipart' : 'json',
      create: verb === 'post',
      pref: route.pref,
    };
    return hooksFor(verb).map((hook) => {
      const fn = function modelHook(req, res, next) {
        return model[hook].call(model, req, res, next, { ...additional });
      };
      Object.defineProperty(fn, 'name', { value: hook });
      return fn;
    });
  }

  /** @private import an app-relative file once, with a clear error when missing. */
  async load(relative, what, label) {
    const abs = appPath(relative);
    if (this.moduleCache.has(abs)) return this.moduleCache.get(abs);
    if (!fs.existsSync(abs)) {
      throw new Error(`[@averoa/routes] route ${label}: ${what} file not found: ${abs}`);
    }
    const promise = import(pathToFileURL(abs).href).catch((cause) => {
      this.moduleCache.delete(abs); // let a retried init() import it again
      throw new Error(`[@averoa/routes] route ${label}: failed to load ${what} ${abs}: ${cause.message}`, { cause });
    });
    this.moduleCache.set(abs, promise);
    return promise;
  }

  /** @private 'Controller@method' | function -> bound function. */
  async resolveHandler(handler, label) {
    if (typeof handler === 'function') return handler;

    const [name, method] = handler.split('@');
    const file = path.posix.join(this.paths.controller, `${name}.js`);
    const mod = await this.load(file, 'controller', label);
    const target = this.instantiate(mod.default ?? mod[name], method);
    if (!target || typeof target[method] !== 'function') {
      throw new Error(`[@averoa/routes] route ${label}: method "${method}" not found on controller ${name} (${appPath(file)})`);
    }
    return target[method].bind(target);
  }

  /**
   * @private Controllers/middleware may export an instance, an object, a class
   * with a static `method` (used as is, `this` = the class, like 1.x), or a
   * class with an instance `method` (created once and cached).
   */
  instantiate(exported, method) {
    if (typeof exported !== 'function') return exported;
    if (hasStatic(exported, method)) return exported;
    const looksLikeClass = isClass(exported)
      || (exported.prototype && typeof exported.prototype[method] === 'function');
    if (!looksLikeClass) return exported; // a plain function
    return this.instanceOf(exported);
  }

  /** @private the cached instance of `Class` for this router (created on first use). */
  instanceOf(Class) {
    if (!this.instanceCache.has(Class)) this.instanceCache.set(Class, new Class());
    return this.instanceCache.get(Class);
  }

  /** @private middleware name | function | object with the middleware method -> function. */
  async resolveMiddleware(entry, label, method = this.middlewareMethod) {
    if (typeof entry === 'string') {
      const file = path.posix.join(this.paths.middleware, `${entry}.js`);
      const mod = await this.load(file, 'middleware', label);
      const fn = this.toMiddleware(this.instantiate(mod.default ?? mod[entry], method), method);
      if (!fn) {
        throw new Error(`[@averoa/routes] route ${label}: middleware ${entry} (${appPath(file)}) has no "${method}" method`);
      }
      return fn;
    }
    // A class passed inline: static method -> the class itself; otherwise one
    // cached instance per router, however many routes list it.
    const target = isClass(entry) && !hasStatic(entry, method) ? this.instanceOf(entry) : entry;
    const fn = this.toMiddleware(target, method);
    if (!fn) throw new TypeError(`[@averoa/routes] route ${label}: invalid middleware ${String(entry)}`);
    return fn;
  }

  /** @private */
  toMiddleware(target, method) {
    if (target && typeof target[method] === 'function') return target[method].bind(target);
    if (typeof target === 'function' && !isClass(target)) return target;
    return null;
  }

  /**
   * @private app/Models/<name>.js default export. Only the hooks used by the
   * route's verbs are required (all()/head/options use none, get/delete use
   * checkParamId + mapRequest).
   */
  async resolveModel(name, label, verbs) {
    const file = path.posix.join(this.paths.model, `${name}.js`);
    const mod = await this.load(file, 'model', label);
    const model = mod.default ?? mod[name];
    const used = new Set(verbs.flatMap(hooksFor));
    const missing = MODEL_HOOKS.filter((h) => used.has(h) && typeof model?.[h] !== 'function');
    if (missing.length) {
      throw new Error(`[@averoa/routes] route ${label}: model ${name} (${appPath(file)}) is missing ${missing.join(', ')}`);
    }
    return model;
  }

  /**
   * @private Global middleware from app/Providers/index.js `MiddlewareProvider`
   * beginning()/end() (both optional, sync or async, may return undefined). Resolved once.
   */
  async resolveGlobalMiddleware() {
    const providers = await importApp('app/Providers/index.js', { optional: true });
    let provider = providers?.MiddlewareProvider;
    if (isClass(provider) && !hasStatic(provider, 'beginning') && !hasStatic(provider, 'end')) {
      provider = new provider();
    }

    const collect = async (kind) => {
      // beginning()/end() may be sync or async and may return undefined
      const list = typeof provider?.[kind] === 'function' ? await provider[kind]() : undefined;
      if (list != null && typeof list[Symbol.iterator] !== 'function') {
        throw new Error(`[@averoa/routes] MiddlewareProvider.${kind}() must return an array (or nothing)`);
      }
      const out = [];
      for (const entry of list ?? []) {
        out.push(await this.resolveMiddleware(entry, `MiddlewareProvider.${kind}()`, 'handle'));
      }
      return out;
    };
    return { beginning: await collect('beginning'), end: await collect('end') };
  }
}

/**
 * Create a new router definition: `const router = Router()`.
 * @returns {AveroaRouter}
 */
export function Router() {
  return new AveroaRouter();
}

export default Router;
