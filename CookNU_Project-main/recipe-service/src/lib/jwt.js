'use strict';
// Minimal HS256 JSON Web Token implementation using Node's crypto module.
// The auth-service signs tokens; every service verifies them with the same JWT_SECRET.
const crypto = require('node:crypto');

const encode = (value) => Buffer.from(value).toString('base64url');
const hmac = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest();

function sign(payload, secret, ttlSeconds = 7 * 24 * 3600, nowMs = Date.now()) {
  const iat = Math.floor(nowMs / 1000);
  const header = encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = encode(JSON.stringify({ ...payload, iat, exp: iat + ttlSeconds }));
  const signature = hmac(`${header}.${body}`, secret).toString('base64url');
  return `${header}.${body}.${signature}`;
}

// Returns the payload, or throws if the token is malformed, forged, or expired.
function verify(token, secret, nowMs = Date.now()) {
  if (typeof token !== 'string') throw new Error('Malformed token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const [header, body, signature] = parts;

  let parsedHeader;
  try {
    parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Malformed token');
  }
  // Reject anything but HS256 (blocks the classic alg:"none" trick).
  if (parsedHeader.alg !== 'HS256') throw new Error('Unsupported algorithm');

  const expected = hmac(`${header}.${body}`, secret);
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Malformed token');
  }
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs) throw new Error('Token expired');
  return payload;
}

module.exports = { sign, verify };
