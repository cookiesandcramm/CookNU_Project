'use strict';
// Password hashing with scrypt (built into Node, no native modules to compile).
// Stored format: scrypt$<N>$<salt hex>$<hash hex>
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const N = 16384;
const KEY_LENGTH = 64;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH, { N, r: 8, p: 1 });
  return `scrypt$${N}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, n, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !n || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, { N: Number(n), r: 8, p: 1 });
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

module.exports = { hashPassword, verifyPassword };
