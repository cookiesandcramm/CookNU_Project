'use strict';
const { createRouter, createHandler, HttpError, json } = require('./lib/http');
const { requireUser } = require('./lib/auth');

const SERVICE = 'notification-service';

function createApp({ repo, jwtSecret, version = 'dev', log }) {
  const router = createRouter();

  const health = async () => {
    try {
      await repo.ping();
      return json(200, { status: 'ok', service: SERVICE, version, database: 'up' });
    } catch {
      return json(503, { status: 'unavailable', service: SERVICE, version, database: 'down' });
    }
  };
  router.get('/health', health);
  router.get('/api/notifications/health', health);

  // GET /api/notifications?limit=20  ->  newest first, plus the unread count (for the bell dot)
  router.get('/api/notifications', async ({ req, query }) => {
    const user = requireUser(req, jwtSecret);
    let limit = 20;
    if (query.get('limit') !== null) {
      limit = Number(query.get('limit'));
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new HttpError(400, 'Validation failed', { limit: 'limit must be an integer between 1 and 100.' });
      }
    }
    const [notifications, unread] = await Promise.all([repo.list(user.id, limit), repo.countUnread(user.id)]);
    return json(200, { notifications, unread });
  });

  router.post('/api/notifications/read-all', async ({ req }) => {
    const user = requireUser(req, jwtSecret);
    return json(200, { updated: await repo.markAllRead(user.id) });
  });

  return { handler: createHandler(router, { log }) };
}

module.exports = { createApp };
