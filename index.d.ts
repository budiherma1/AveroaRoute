// Type declarations for @averoa/routes (hand-written; the runtime is plain JavaScript in index.js).
//
// These types are self-contained: they do not import `express`, `multer` or `@types/*`, so a
// consumer without @types/express or @types/node can use them. Request and response objects
// default to `any`; pass your own types to opt in to precise handler parameters:
//
//   import type { Request, Response } from 'express';
//   const router = Router<Request, Response>();

/** `next` as passed to handlers and middleware: `next()`, `next(err)`, `next('route')`, `next('router')`. */
export type NextFunction = (err?: unknown) => void;

/** A route handler or middleware function `(req, res, next)`. */
export type RequestHandler<Req = any, Res = any> = (req: Req, res: Res, next: NextFunction) => unknown;

/**
 * An Express error handler `(err, req, res, next)`. In a middleware array it keeps its four
 * arguments, so Express only calls it with an error. Annotate inline error handlers with this
 * type: `const onError: ErrorRequestHandler = (err, req, res, next) => ...`.
 */
export type ErrorRequestHandler<Req = any, Res = any> = (
  err: any,
  req: Req,
  res: Res,
  next: NextFunction,
) => unknown;

/** `'Controller@method'`, resolved from the controller folder by `init()` (`'Admin/UserController@show'` works too). */
export type ControllerAction = `${string}@${string}`;

/** What a route runs: a `'Controller@method'` string or a function `(req, res, next)`. */
export type RouteHandler<Req = any, Res = any> = ControllerAction | RequestHandler<Req, Res>;

/**
 * A middleware entry:
 * - a name (`'AuthMiddleware'`), loaded from the middleware folder;
 * - a function `(req, res, next)`;
 * - an `ErrorRequestHandler` `(err, req, res, next)` (covered by `object`; annotate it, see above);
 * - an object or instance with the middleware method (`handle` by default, see `config()`);
 * - a class with a static or an instance middleware method.
 *
 * `ErrorRequestHandler` is deliberately not a member of the union: two function types of
 * different arity would leave inline `(req, res, next) => ...` lambdas without contextual types.
 */
export type MiddlewareEntry<Req = any, Res = any> =
  | string
  | RequestHandler<Req, Res>
  | object;

/** One middleware entry or an array of them. */
export type MiddlewareList<Req = any, Res = any> = MiddlewareEntry<Req, Res> | readonly MiddlewareEntry<Req, Res>[];

/** Verbs accepted by `match()` (case-insensitive at runtime). */
export type MatchVerb = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options' | 'all';

/** Verbs a recorded route can have. */
export type RouteVerb = MatchVerb;

/**
 * Scope callbacks must be synchronous: returning a Promise is a type error here and throws
 * at runtime (routes declared after an `await` would lose the scope).
 */
export type SyncResult<R> = R extends PromiseLike<unknown> ? never : R;

/** multer limits for `*Form` routes. Any other multer limit key is passed through as well. */
export interface UploadLimits {
  fileSize?: number;
  files?: number;
  fields?: number;
  fieldSize?: number;
  fieldNameSize?: number;
  parts?: number;
  headerPairs?: number;
  [key: string]: number | undefined;
}

/** Limits a `*Form` route uses, as returned by `resolveUploadLimits()`. */
export interface ResolvedUploadLimits extends UploadLimits {
  fileSize: number;
  files: number;
  fields: number;
  fieldSize: number;
  parts: number;
}

/** Options of `router.config()`. Every key is optional. */
export interface RouterConfig {
  /** Folder of controllers, relative to the application root (default `'app/Controllers'`). */
  controller?: { path?: string };
  /** Folder of named middleware (default `'app/Middleware'`) and the method called on middleware objects (default `'handle'`). */
  middleware?: { path?: string; method?: string };
  /** Folder of models used by `crud()` (default `'app/Models'`). */
  model?: { path?: string };
  /** multer limits for `*Form` routes; wins over the environment and the defaults. Repeated calls merge. */
  upload?: { limits?: UploadLimits };
}

/** Options of `router.group()`. */
export interface GroupOptions {
  prefix?: string;
  middleware?: MiddlewareList;
}

/**
 * Route documentation given to `.doc()`. The router stores the object as is; `@averoa/core`
 * reads the keys below when it builds the OpenAPI document. Other keys are kept too.
 */
export interface RouteDoc {
  summary?: string;
  description?: string;
  tags?: string[];
  operationId?: string;
  deprecated?: boolean;
  /** `false` removes security from the operation; an array replaces it. */
  security?: false | Array<Record<string, string[]>>;
  request?: {
    body?: unknown;
    query?: unknown;
    params?: unknown;
    headers?: unknown;
    contentType?: string;
    [key: string]: unknown;
  };
  /** By status code (`200`, `'2XX'`, ...). */
  responses?: Record<string, unknown>;
  /** `true` leaves the route out of the OpenAPI document. */
  exclude?: boolean;
  [key: string]: unknown;
}

/** A path parameter of an OpenAPI path template. `wildcard` is `true` for `*name` parameters. */
export interface PathParam {
  name: string;
  wildcard: boolean;
}

/** One OpenAPI path template, as returned by `toOpenApiPaths()`. */
export interface OpenApiPath {
  path: string;
  params: PathParam[];
}

/** crud() model hook names. */
export type ModelHook = 'checkParamId' | 'validationRouter' | 'mapRequest';

/** The last argument passed to every crud() model hook. */
export interface ModelHookContext {
  /** `'multipart'` only for postForm, putForm and patchForm. */
  type: 'json' | 'multipart';
  /** `true` only for POST. */
  create: boolean;
  /** Every enclosing prefix, slashes removed. */
  pref: string;
}

/** One entry of `router.describe()`: one per verb and path variant. */
export interface RouteDescription {
  method: RouteVerb;
  /** Full Express path, prefixes included. */
  path: string;
  /** The same path as an OpenAPI template (`/teachers/{id}`). */
  openapiPath: string;
  params: PathParam[];
  /** `'Controller@method'`, the function's name, or `'anonymous'`. */
  handler: string;
  /** Names of the whole middleware chain, in run order. */
  middleware: string[];
  /** The same chain as declared. */
  middlewareEntries: MiddlewareEntry[];
  model: string | null;
  modelClass: unknown;
  hooks: ModelHook[];
  form: boolean;
  doc: RouteDoc | null;
}

/** A route as recorded by get/post/... (`router.routes`). Resolution happens in `init()`. */
export interface RouteDefinition {
  verbs: RouteVerb[];
  path: string;
  label: string;
  handler: RouteHandler;
  middleware: MiddlewareEntry[];
  model: string | null;
  pref: string;
  form: boolean;
  doc: RouteDoc | null;
}

/**
 * The `express.Router` built by `init()`, typed structurally so that no Express types are
 * required. It is a request handler, so `app.use(await router.init())` type-checks against
 * @types/express; cast it to `import('express').Router` for the full Express API.
 */
export interface BuiltRouter {
  (req: any, res: any, next: NextFunction): void;
  stack: unknown[];
}

/** Laravel-style route definitions recorded on top of express.Router. */
export class AveroaRouter<Req = any, Res = any> {
  constructor();

  /** Same as `new AveroaRouter()` (or a subclass). */
  static Router<T extends AveroaRouter<any, any>>(this: new () => T): T;

  /** Recorded route definitions. Change them only through the methods. */
  routes: RouteDefinition[];

  /** The built router once `init()` has resolved, `null` before. */
  router: BuiltRouter | null;

  /** Configure folders, the middleware method and upload limits. */
  config(options?: RouterConfig): this;

  get(uri: string, handler: RouteHandler<Req, Res>, middleware?: MiddlewareList<Req, Res>): this;
  post(uri: string, handler: RouteHandler<Req, Res>, middleware?: MiddlewareList<Req, Res>): this;
  put(uri: string, handler: RouteHandler<Req, Res>, middleware?: MiddlewareList<Req, Res>): this;
  patch(uri: string, handler: RouteHandler<Req, Res>, middleware?: MiddlewareList<Req, Res>): this;
  delete(uri: string, handler: RouteHandler<Req, Res>, middleware?: MiddlewareList<Req, Res>): this;

  /** POST with multipart/form-data parsing (files in `req.files`). */
  postForm(uri: string, handler: RouteHandler<Req, Res>, middleware?: MiddlewareList<Req, Res>): this;
  /** PUT with multipart/form-data parsing. */
  putForm(uri: string, handler: RouteHandler<Req, Res>, middleware?: MiddlewareList<Req, Res>): this;
  /** PATCH with multipart/form-data parsing. */
  patchForm(uri: string, handler: RouteHandler<Req, Res>, middleware?: MiddlewareList<Req, Res>): this;

  /** Register the same route for several verbs: `match(['get', 'post'], uri, handler)`. */
  match(
    verbs: MatchVerb | Uppercase<MatchVerb> | ReadonlyArray<MatchVerb | Uppercase<MatchVerb>>,
    uri: string,
    handler: RouteHandler<Req, Res>,
    middleware?: MiddlewareList<Req, Res>,
  ): this;

  /** GET + POST + PUT + DELETE + PATCH. */
  any(uri: string, handler: RouteHandler<Req, Res>, middleware?: MiddlewareList<Req, Res>): this;

  /** express `router.all()`: every verb, no crud model hooks. */
  all(uri: string, handler: RouteHandler<Req, Res>, middleware?: MiddlewareList<Req, Res>): this;

  /** Apply middleware to every route declared inside the (synchronous) callback. */
  middleware<R>(names: MiddlewareList<Req, Res>, callback: (router: this) => SyncResult<R>): this;

  /** Prefix every route declared inside the (synchronous) callback. */
  prefix<R>(prefix: string, callback: (router: this) => SyncResult<R>): this;

  /** `prefix()` and `middleware()` at once; either key may be omitted. */
  group<R>(options: GroupOptions, callback: (router: this) => SyncResult<R>): this;

  /** Prefix + the checkParamId / validationRouter / mapRequest hooks of `<model folder>/<model>.js`. */
  crud<R>(model: string, prefix: string, callback: (router: this) => SyncResult<R>): this;
  crud<R>(model: string, callback: (router: this) => SyncResult<R>): this;

  /** Alias of `crud()`. */
  set<R>(model: string, prefix: string, callback: (router: this) => SyncResult<R>): this;
  set<R>(model: string, callback: (router: this) => SyncResult<R>): this;

  /** Attach documentation to the route declared just before it; several calls merge. */
  doc(meta: RouteDoc): this;

  /** Metadata of every route; throws before `init()` has resolved. Returns fresh copies. */
  describe(): RouteDescription[];

  /**
   * Resolve controllers, middleware and models and build the express.Router. Calling it
   * again returns the same promise; a rejected init() can be retried.
   */
  init(): Promise<BuiltRouter>;
}

/** Create a new, empty router definition. */
export function Router<Req = any, Res = any>(): AveroaRouter<Req, Res>;

export default Router;

/** Default `fileSize` limit for `*Form` routes: 10 MB. */
export const DEFAULT_MAX_FILE_SIZE: number;

/** Default multer limits for `*Form` routes (frozen). */
export const DEFAULT_UPLOAD_LIMITS: Readonly<{
  fileSize: number;
  files: number;
  fields: number;
  fieldSize: number;
}>;

/** The multer limits a `*Form` route uses: `configured` > env UPLOAD_MAX_FILE_SIZE / UPLOAD_MAX_FILES > defaults. */
export function resolveUploadLimits(configured?: UploadLimits): ResolvedUploadLimits;

/** Convert an Express 5 path to OpenAPI path templates (one per `{optional}` variant, shortest first). */
export function toOpenApiPaths(expressPath: string): OpenApiPath[];
