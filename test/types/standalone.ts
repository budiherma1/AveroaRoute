// Uses only @averoa/routes (no express import). tsconfig.json sets "types": [] and
// skipLibCheck: false, so this also proves index.d.ts needs neither @types/node nor
// @types/express.
import Router, {
  Router as createRouter,
  AveroaRouter,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_UPLOAD_LIMITS,
  resolveUploadLimits,
  toOpenApiPaths,
} from '@averoa/routes';
import type {
  BuiltRouter,
  ErrorRequestHandler,
  OpenApiPath,
  RequestHandler,
  ResolvedUploadLimits,
  RouteDescription,
} from '@averoa/routes';

// ---------------------------------------------------------------- exports

const router = Router();
const other: AveroaRouter = createRouter();
const fromStatic: AveroaRouter = AveroaRouter.Router();
const fromNew = new AveroaRouter();
void other; void fromStatic; void fromNew;

class MyRouter extends AveroaRouter {
  extra(): string { return 'x'; }
}
const mine: MyRouter = MyRouter.Router();
mine.extra();

const size: number = DEFAULT_MAX_FILE_SIZE;
const files: number = DEFAULT_UPLOAD_LIMITS.files;
// @ts-expect-error DEFAULT_UPLOAD_LIMITS is frozen
DEFAULT_UPLOAD_LIMITS.files = 1;
const limits: ResolvedUploadLimits = resolveUploadLimits({ fileSize: 5 * 1024 * 1024 });
const parts: number = limits.parts;
resolveUploadLimits();
void size; void files; void parts;

const variants: OpenApiPath[] = toOpenApiPaths('/files{/:name}');
const firstName: string | undefined = variants[0]?.params[0]?.name;
void firstName;

// ---------------------------------------------------------------- quick start routes file

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
    router.post('/', 'TeacherController@create');
    router.postForm('/upload', 'TeacherController@create');
    router.put('/:id', 'TeacherController@update');
    router.delete('/:id', 'TeacherController@delete');
  });
});

// ---------------------------------------------------------------- route methods

router
  .get('/posts', 'PostController@index')
  .post('/posts', 'PostController@store', ['AuthMiddleware']);

router.put('/p/:id', 'PostController@update', 'AuthMiddleware');
router.patch('/p/:id', 'PostController@update');
router.putForm('/p/:id/file', 'PostController@upload');
router.patchForm('/p/:id/file', 'PostController@upload');
router.match(['get', 'post'], '/both', 'PostController@both');
router.match('OPTIONS', '/opts', 'PostController@opts');
router.any('/any', 'PostController@any');
router.all('/all', 'PostController@all');
router.get('/nested', 'Admin/UserController@show');

// @ts-expect-error a handler string needs "Controller@method"
router.get('/bad', 'HomeController');
// @ts-expect-error handlers are strings or functions
router.get('/bad', 42);
// @ts-expect-error unsupported verb
router.match(['get', 'trace'], '/x', 'A@b');

// ---------------------------------------------------------------- middleware entries

const fail: RequestHandler = (req, res, next) => next(Object.assign(new Error('Forbidden'), { status: 403 }));
const asJson: ErrorRequestHandler = (err, req, res, next) => res.status(err.status ?? 500).json({ message: err.message });
router.get('/reports', 'ReportController@index', [fail, asJson]);

class AuthMiddleware {
  handle(req: unknown, res: unknown, next: () => void): void { next(); }
}
class StaticMiddleware {
  static handle(req: unknown, res: unknown, next: () => void): void { next(); }
}
router.get('/mixed', 'A@b', [
  'AuthMiddleware',
  new AuthMiddleware(),
  AuthMiddleware,
  StaticMiddleware,
  (req, res, next) => { next(); }, // contextually typed
  { handle: (req: unknown, res: unknown, next: () => void) => next() },
]);

// ---------------------------------------------------------------- scopes

router.prefix('v1', (r) => {
  r.get('/ping', 'PingController@ping');
});
router.group({}, () => {});
router.group({ prefix: 'only' }, () => {});
router.crud('Teacher', () => {
  router.get('/', 'TeacherController@findAll');
});
router.set('Teacher', 'teachers', () => {});
router.set('Teacher', () => {});

// @ts-expect-error scope callbacks must be synchronous
router.group({ prefix: 'x' }, async () => {});
// @ts-expect-error scope callbacks must be synchronous
router.crud('Teacher', 'teachers', async () => {});
// @ts-expect-error a callback is required
router.prefix('x');

// the callback receives the router, typed as the subclass
mine.prefix('x', (r) => r.extra());

// ---------------------------------------------------------------- config

router.config({
  controller: { path: 'app/Controllers' },
  middleware: { path: 'app/Middleware', method: 'handle' },
  model: { path: 'app/Models' },
  upload: { limits: { fileSize: 5 * 1024 * 1024 } },
}).config();

// @ts-expect-error unknown config key value
router.config({ controller: { path: 1 } });

// ---------------------------------------------------------------- doc / describe / init

router.post('/auth/login', 'AuthController@login').doc({
  summary: 'Log in with email and password',
  tags: ['Auth'],
  responses: { 401: { description: 'Invalid email or password' } },
}).doc({ deprecated: true, security: false, request: { body: {}, contentType: 'application/json' }, exclude: false });

// @ts-expect-error doc() takes an object
router.doc('summary');

export async function boot(): Promise<void> {
  const built: BuiltRouter = await router.init();
  void built.stack.length;
  const routes: RouteDescription[] = router.describe();
  for (const r of routes) {
    const method: string = r.method;
    const openapiPath: string = r.openapiPath;
    const hooks: string[] = r.hooks;
    const summary: string | undefined = r.doc?.summary;
    void method; void openapiPath; void hooks; void summary;
  }
  const recorded: number = router.routes.length;
  const ready: BuiltRouter | null = router.router;
  void recorded; void ready;
}
