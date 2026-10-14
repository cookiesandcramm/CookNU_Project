'use strict';
const { verify } = require('./jwt');
const { HttpError } = require('./http');

function bearerToken(req) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  return match ? match[1].trim() : null;
}

// Returns { id } for a valid token, otherwise null.
function authenticate(req, secret) {
  const token = bearerToken(req);
  if (!token) return null;
  try {
    const payload = verify(token, secret);
    return typeof payload.sub === 'string' ? { id: payload.sub } : null;
  } catch {
    return null;
  }
}

function requireUser(req, secret) {
  const user = authenticate(req, secret);
  if (!user) throw new HttpError(401, 'Authentication required');
  return user;
}

module.exports = { authenticate, requireUser };
