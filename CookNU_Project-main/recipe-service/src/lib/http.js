'use strict';
// Tiny HTTP toolkit (router, JSON body parsing, error handling) built on Node's
// own "http" module so the services need no web framework.

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

// Handlers return json(status, body).
const json = (status, body) => ({ status, body });

function createRouter() {
  const routes = [];

  const add = (method) => (pattern, handler) => {
    const keys = [];
    const source = pattern.replace(/:([A-Za-z_]+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    });
    routes.push({ method, regex: new RegExp(`^${source}/?$`), keys, handler });
  };

  return {
    get: add('GET'),
    post: add('POST'),
    put: add('PUT'),
    delete: add('DELETE'),
    // Routes are checked in registration order, so register fixed paths
    // (e.g. /health) before parameterised ones (e.g. /:id).
    match(method, pathname) {
      let pathMatched = false;
      for (const route of routes) {
        const m = route.regex.exec(pathname);
        if (!m) continue;
        pathMatched = true;
        if (route.method !== method) continue;
        const params = {};
        try {
          route.keys.forEach((key, i) => { params[key] = decodeURIComponent(m[i + 1]); });
        } catch {
          throw new HttpError(400, 'Malformed URL');
        }
        return { handler: route.handler, params };
      }
      return { pathMatched };
    },
  };
}

async function readJsonBody(req, limitBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new HttpError(413, 'Request body too large');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw new HttpError(400, 'Request body must be a valid JSON object');
  }
}

function send(res, status, body) {
  if (res.headersSent) return;
  const headers = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
  if (status === 204 || body === undefined) {
    res.writeHead(status, headers);
    res.end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...headers,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function createHandler(router, { log = () => {} } = {}) {
  return async function handler(req, res) {
    const started = Date.now();
    let status = 500;
    try {
      const url = new URL(req.url, 'http://localhost');
      const found = router.match(req.method, url.pathname);
      if (!found.handler) {
        throw found.pathMatched ? new HttpError(405, 'Method not allowed') : new HttpError(404, 'Not found');
      }
      const result = await found.handler({
        req,
        params: found.params,
        query: url.searchParams,
        readBody: () => readJsonBody(req),
      });
      status = result.status;
      send(res, status, result.body);
    } catch (err) {
      if (err instanceof HttpError) {
        status = err.status;
        send(res, status, { error: err.message, ...(err.details ? { details: err.details } : {}) });
      } else {
        console.error(err);
        status = 500;
        send(res, 500, { error: 'Internal server error' });
      }
    } finally {
      log(`${req.method} ${req.url} -> ${status} (${Date.now() - started} ms)`);
    }
  };
}

module.exports = { HttpError, json, createRouter, createHandler, readJsonBody };
