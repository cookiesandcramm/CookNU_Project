'use strict';
const { createRouter, createHandler, HttpError, json } = require('./lib/http');
const { sign } = require('./lib/jwt');
const { requireUser } = require('./lib/auth');
const { hashPassword, verifyPassword } = require('./password');
const { validateRegister, validateLogin, validateProfile } = require('./validate');

const SERVICE = 'auth-service';
// Compared against when the email is unknown, so "no such user" and "wrong
// password" take about the same time (avoids leaking which emails exist).
const DUMMY_HASH = `scrypt$16384$${'00'.repeat(16)}$${'00'.repeat(64)}`;

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, avatar: u.avatar || null, createdAt: u.createdAt });

function createApp({ repo, jwtSecret, tokenTtlSeconds = 7 * 24 * 3600, version = 'dev', log }) {
  const router = createRouter();
  const issueToken = (user) => sign({ sub: user.id, name: user.name, email: user.email }, jwtSecret, tokenTtlSeconds);

  async function currentUser(req) {
    const { id } = requireUser(req, jwtSecret);
    const user = await repo.findById(id);
    if (!user) throw new HttpError(401, 'Account no longer exists');
    return user;
  }

  const health = async () => {
    try {
      await repo.ping();
      return json(200, { status: 'ok', service: SERVICE, version, database: 'up' });
    } catch {
      return json(503, { status: 'unavailable', service: SERVICE, version, database: 'down' });
    }
  };
  router.get('/health', health);
  router.get('/api/auth/health', health);

  router.post('/api/auth/register', async ({ readBody }) => {
    const input = validateRegister(await readBody());
    if (await repo.findByEmail(input.email)) throw new HttpError(409, 'An account with this email already exists');
    let user;
    try {
      user = await repo.create({ name: input.name, email: input.email, passwordHash: await hashPassword(input.password) });
    } catch (err) {
      if (err && err.code === '23505') throw new HttpError(409, 'An account with this email already exists'); // unique violation (race)
      throw err;
    }
    return json(201, { user: publicUser(user), token: issueToken(user) });
  });

  router.post('/api/auth/login', async ({ readBody }) => {
    const { email, password } = validateLogin(await readBody());
    const user = await repo.findByEmail(email);
    const valid = await verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !valid) throw new HttpError(401, 'Invalid email or password');
    return json(200, { user: publicUser(user), token: issueToken(user) });
  });

  router.get('/api/auth/me', async ({ req }) => json(200, { user: publicUser(await currentUser(req)) }));

  router.put('/api/auth/me', async ({ req, readBody }) => {
    const existing = await currentUser(req);
    const patch = validateProfile(await readBody());
    const updated = await repo.update(existing.id, {
      name: patch.name !== undefined ? patch.name : existing.name,
      avatar: patch.avatar !== undefined ? patch.avatar : existing.avatar,
    });
    return json(200, { user: publicUser(updated) });
  });

  router.delete('/api/auth/me', async ({ req }) => {
    const user = await currentUser(req);
    await repo.remove(user.id);
    return json(204);
  });

  return { handler: createHandler(router, { log }) };
}

module.exports = { createApp };
