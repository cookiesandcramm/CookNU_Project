'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { createMemoryRepo } = require('./memory-repo');
const { startServer } = require('./helpers');
const { sign } = require('../src/lib/jwt');

const SECRET = 'test-secret-with-enough-length';

describe('notification-service API', () => {
  let repo, api;
  const anaToken = sign({ sub: 'ana-id' }, SECRET);
  const benToken = sign({ sub: 'ben-id' }, SECRET);

  before(async () => {
    repo = createMemoryRepo();
    api = await startServer(createApp({ repo, jwtSecret: SECRET, version: 'test-1' }));
  });
  after(() => api.close());
  beforeEach(() => repo.setHealthy(true));

  test('GET /health reports ok and version', async () => {
    const res = await api.request('GET', '/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok', service: 'notification-service', version: 'test-1', database: 'up' });
  });

  test('GET /health returns 503 when the database is down', async () => {
    repo.setHealthy(false);
    assert.equal((await api.request('GET', '/health')).status, 503);
    assert.equal((await api.request('GET', '/api/notifications/health')).status, 503);
  });

  test('listing requires authentication', async () => {
    assert.equal((await api.request('GET', '/api/notifications')).status, 401);
    assert.equal((await api.request('GET', '/api/notifications', { token: 'bad' })).status, 401);
  });

  test('a new user has no notifications', async () => {
    const res = await api.request('GET', '/api/notifications', { token: anaToken });
    assert.deepEqual(res.body, { notifications: [], unread: 0 });
  });

  test('returns only the caller\'s notifications, newest first, with unread count', async () => {
    repo.seed('ana-id', 'Ben liked your recipe "A"');
    repo.seed('ana-id', 'Cara liked your recipe "B"');
    repo.seed('ben-id', 'Ana liked your recipe "C"');
    const res = await api.request('GET', '/api/notifications', { token: anaToken });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.notifications.map((n) => n.text), ['Cara liked your recipe "B"', 'Ben liked your recipe "A"']);
    assert.equal(res.body.unread, 2);
  });

  test('limit restricts the page size and is validated', async () => {
    const res = await api.request('GET', '/api/notifications?limit=1', { token: anaToken });
    assert.equal(res.body.notifications.length, 1);
    assert.equal((await api.request('GET', '/api/notifications?limit=0', { token: anaToken })).status, 400);
    assert.equal((await api.request('GET', '/api/notifications?limit=abc', { token: anaToken })).status, 400);
  });

  test('read-all marks only the caller\'s notifications as read', async () => {
    assert.equal((await api.request('POST', '/api/notifications/read-all')).status, 401);

    const res = await api.request('POST', '/api/notifications/read-all', { token: anaToken });
    assert.deepEqual(res.body, { updated: 2 });

    const ana = (await api.request('GET', '/api/notifications', { token: anaToken })).body;
    assert.equal(ana.unread, 0);
    assert.ok(ana.notifications.every((n) => n.read));

    const ben = (await api.request('GET', '/api/notifications', { token: benToken })).body;
    assert.equal(ben.unread, 1); // untouched
    assert.deepEqual(ben.notifications.map((n) => n.text), ['Ana liked your recipe "C"']); // and still his own
  });

  test('read-all is idempotent', async () => {
    const res = await api.request('POST', '/api/notifications/read-all', { token: anaToken });
    assert.deepEqual(res.body, { updated: 0 });
  });
});
