import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { resetAppRoot } from '@averoa/utilities/paths';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Point the app root at test/fixtures/<name>. */
export function useFixture(name) {
  process.env.AVEROA_ROOT = path.join(here, 'fixtures', name);
  resetAppRoot();
}

/**
 * Mount an initialized AveroaRouter on a fresh express app, listen on an
 * ephemeral port and return { url, close }.
 */
export async function serve(router) {
  const app = express();
  app.use(express.json());
  app.use(await router.init());
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(err.status ?? 500).json({ error: err.message, code: err.code ?? null });
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }),
  };
}

/** fetch + parse JSON. */
export async function call(base, method, pathname, { json, form } = {}) {
  const init = { method };
  if (json !== undefined) {
    init.body = JSON.stringify(json);
    init.headers = { 'content-type': 'application/json' };
  }
  if (form !== undefined) init.body = form;
  const res = await fetch(base + pathname, init);
  const text = await res.text();
  let body = text;
  try { body = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body };
}
