// Interop with @types/express (a dev dependency here, never required by consumers):
// Express-typed handlers are accepted, and the built router mounts with app.use().
import express from 'express';
import type {
  ErrorRequestHandler as ExpressErrorHandler,
  NextFunction,
  Request,
  RequestHandler as ExpressHandler,
  Response,
  Router as ExpressRouter,
} from 'express';
import Router, { type ErrorRequestHandler } from '@averoa/routes';

// untyped router: Express-annotated functions are accepted as handlers and middleware
const router = Router();
const health: ExpressHandler = (req, res) => { res.json({ ok: true }); };
const onError: ExpressErrorHandler = (err, req, res, next) => { next(err); };
router.get('/health', health, [onError]);
router.get('/me', (req: Request, res: Response, next: NextFunction) => {
  if (!req.headers.authorization) return res.status(401).json({ message: 'Unauthorized' });
  return next();
});

// typed router: inline handlers get Express's Request/Response
const typed = Router<Request, Response>();
typed.get('/:id', (req, res) => {
  const id: string | string[] | undefined = req.params.id;
  res.status(200).json({ id });
});
typed.post('/items', 'ItemController@store', [(req, res, next) => { void req.body; next(); }]);
typed.get('/readme/:id', (req, res) => { res.json({ id: req.params.id }); });
const readmeOnError: ErrorRequestHandler = (err, req, res, next) => res.status(err.status ?? 500).end();
typed.get('/readme', 'A@b', [readmeOnError]);
// @ts-expect-error Express's Response has no `nope`
typed.get('/x', (req, res) => res.nope());

export async function main(): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use('/api', await router.init());
  app.use(await typed.init());
  const full = (await router.init()) as unknown as ExpressRouter;
  full.use((req, res, next) => next());
}
