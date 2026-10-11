'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { createMemoryRepo } = require('./memory-repo');
const { startServer } = require('./helpers');
const { verify } = require('../src/lib/jwt');

const SECRET = 'test-secret-with-enough-length';
const valid = { name: 'Maria Clara', email: 'maria@example.com', password: 'Secret@123' };

describe('auth-service API', () => {
  let repo, api;

  before(async () => {
    repo = createMemoryRepo();
    api = await startServer(createApp({ repo, jwtSecret: SECRET, version: 'test-1' }));
  });
  after(() => api.close());
  beforeEach(() => repo.setHealthy(true));

  test('GET /health reports ok and the build version', async () => {
    const res = await api.request('GET', '/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok', service: 'auth-service', version: 'test-1', database: 'up' });
  });

  test('GET /api/auth/health works through the proxy path too', async () => {
    assert.equal((await api.request('GET', '/api/auth/health')).status, 200);
  });

  test('GET /health returns 503 when the database is unreachable', async () => {
    repo.setHealthy(false);
    const res = await api.request('GET', '/health');
    assert.equal(res.status, 503);
    assert.equal(res.body.database, 'down');
  });

  test('register creates an account, returns a signed token, never the password', async () => {
    const res = await api.request('POST', '/api/auth/register', { body: valid });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, 'maria@example.com');
    assert.equal(res.body.user.passwordHash, undefined);
    assert.equal(res.body.user.password, undefined);
    assert.equal(verify(res.body.token, SECRET).sub, res.body.user.id);
  });

  test('register stores a salted hash, not the plain password', async () => {
    const stored = await repo.findByEmail('maria@example.com');
    assert.match(stored.passwordHash, /^scrypt\$16384\$[0-9a-f]+\$[0-9a-f]+$/);
    assert.ok(!stored.passwordHash.includes('Secret@123'));
  });

  test('register rejects a duplicate email (case-insensitive) with 409', async () => {
    const res = await api.request('POST', '/api/auth/register', { body: { ...valid, email: 'MARIA@example.com' } });
    assert.equal(res.status, 409);
  });

  test('register validates every field and reports which ones failed', async () => {
    const res = await api.request('POST', '/api/auth/register', { body: { name: '', email: 'nope', password: 'abc' } });
    assert.equal(res.status, 400);
    assert.deepEqual(Object.keys(res.body.details).sort(), ['email', 'name', 'password']);
  });

  test('register enforces the password policy (capital letter + symbol, 6+ chars)', async () => {
    for (const password of ['short', 'nocapital@1', 'NoSymbol123']) {
      const res = await api.request('POST', '/api/auth/register', { body: { ...valid, email: `x${password}@example.com`, password } });
      assert.equal(res.status, 400, password);
      assert.ok(res.body.details.password);
    }
  });

  test('register rejects malformed JSON and non-object bodies with 400', async () => {
    assert.equal((await api.request('POST', '/api/auth/register', { rawBody: '{not json' })).status, 400);
    assert.equal((await api.request('POST', '/api/auth/register', { rawBody: '[1,2,3]' })).status, 400);
  });

  test('login succeeds with correct credentials (email is case-insensitive)', async () => {
    const res = await api.request('POST', '/api/auth/login', { body: { email: 'Maria@Example.com', password: valid.password } });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  test('no response ever contains the password hash', async () => {
    const login = await api.request('POST', '/api/auth/login', { body: { email: valid.email, password: valid.password } });
    const me = await api.request('GET', '/api/auth/me', { token: login.body.token });
    const updated = await api.request('PUT', '/api/auth/me', { token: login.body.token, body: { name: 'Maria Clara' } });
    for (const res of [login, me, updated]) {
      const text = JSON.stringify(res.body);
      assert.ok(!text.includes('scrypt$'), 'hash leaked');
      assert.ok(!/password/i.test(text), 'password field leaked');
    }
  });

  test('login fails with 401 and the same message for wrong password or unknown email', async () => {
    const wrongPw = await api.request('POST', '/api/auth/login', { body: { email: valid.email, password: 'Wrong@123' } });
    const unknown = await api.request('POST', '/api/auth/login', { body: { email: 'ghost@example.com', password: 'Wrong@123' } });
    assert.equal(wrongPw.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrongPw.body.error, unknown.body.error);
  });

  test('GET /me requires a token', async () => {
    assert.equal((await api.request('GET', '/api/auth/me')).status, 401);
    assert.equal((await api.request('GET', '/api/auth/me', { token: 'garbage' })).status, 401);
  });

  test('GET /me rejects a token signed with a different secret', async () => {
    const { sign } = require('../src/lib/jwt');
    const forged = sign({ sub: 'someone' }, 'another-secret-entirely-different');
    assert.equal((await api.request('GET', '/api/auth/me', { token: forged })).status, 401);
  });

  test('GET /me rejects an expired token', async () => {
    const { sign } = require('../src/lib/jwt');
    const { user } = (await api.request('POST', '/api/auth/login', { body: { email: valid.email, password: valid.password } })).body;
    const expired = sign({ sub: user.id }, SECRET, 60, Date.now() - 3600 * 1000);
    assert.equal((await api.request('GET', '/api/auth/me', { token: expired })).status, 401);
  });

  test('GET /me returns the logged-in user', async () => {
    const { token } = (await api.request('POST', '/api/auth/login', { body: { email: valid.email, password: valid.password } })).body;
    const res = await api.request('GET', '/api/auth/me', { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.name, 'Maria Clara');
  });

  test('PUT /me updates name and avatar, and avatar can be removed', async () => {
    const { token } = (await api.request('POST', '/api/auth/login', { body: { email: valid.email, password: valid.password } })).body;
    const avatar = 'data:image/jpeg;base64,AAAA';
    let res = await api.request('PUT', '/api/auth/me', { token, body: { name: 'Maria C.', avatar } });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.name, 'Maria C.');
    assert.equal(res.body.user.avatar, avatar);

    res = await api.request('PUT', '/api/auth/me', { token, body: { name: 'Maria D.' } }); // avatar untouched
    assert.equal(res.body.user.avatar, avatar);

    res = await api.request('PUT', '/api/auth/me', { token, body: { avatar: null } });
    assert.equal(res.body.user.avatar, null);
    assert.equal(res.body.user.name, 'Maria D.');
  });

  test('PUT /me rejects an empty update and a non-image avatar', async () => {
    const { token } = (await api.request('POST', '/api/auth/login', { body: { email: valid.email, password: valid.password } })).body;
    assert.equal((await api.request('PUT', '/api/auth/me', { token, body: {} })).status, 400);
    assert.equal((await api.request('PUT', '/api/auth/me', { token, body: { avatar: 'javascript:alert(1)' } })).status, 400);
  });

  test('DELETE /me removes the account; the old token then stops working', async () => {
    const { token } = (await api.request('POST', '/api/auth/login', { body: { email: valid.email, password: valid.password } })).body;
    assert.equal((await api.request('DELETE', '/api/auth/me', { token })).status, 204);
    assert.equal((await api.request('GET', '/api/auth/me', { token })).status, 401);
    assert.equal((await api.request('POST', '/api/auth/login', { body: { email: valid.email, password: valid.password } })).status, 401);
  });

  test('unknown routes return 404 and wrong methods return 405', async () => {
    assert.equal((await api.request('GET', '/api/auth/nope')).status, 404);
    assert.equal((await api.request('GET', '/api/auth/login')).status, 405);
  });
});
