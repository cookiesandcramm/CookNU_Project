'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { sign, verify } = require('../src/lib/jwt');

const SECRET = 'unit-test-secret-0123456789';
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const hmac = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

describe('JWT helper', () => {
  test('a signed token verifies and carries its payload', () => {
    const payload = verify(sign({ sub: 'u1' }, SECRET), SECRET);
    assert.equal(payload.sub, 'u1');
    assert.ok(payload.exp > payload.iat);
  });

  test('a tampered payload is rejected', () => {
    const [h, , s] = sign({ sub: 'u1' }, SECRET).split('.');
    const forgedBody = b64({ sub: 'admin', iat: 1, exp: 9999999999 });
    assert.throws(() => verify(`${h}.${forgedBody}.${s}`, SECRET), /signature/i);
  });

  test('a token signed with another secret is rejected', () => {
    assert.throws(() => verify(sign({ sub: 'u1' }, 'some-other-secret-value'), SECRET), /signature/i);
  });

  test('an expired token is rejected', () => {
    assert.throws(() => verify(sign({ sub: 'u1' }, SECRET, 60, Date.now() - 120000), SECRET), /expired/i);
  });

  test('"alg: none" tokens are rejected', () => {
    const body = b64({ sub: 'u1', exp: 9999999999 });
    assert.throws(() => verify(`${b64({ alg: 'none', typ: 'JWT' })}.${body}.`, SECRET));
  });

  test('a header declaring another algorithm is rejected even with a valid HMAC', () => {
    const header = b64({ alg: 'HS512', typ: 'JWT' });
    const body = b64({ sub: 'u1', exp: 9999999999 });
    assert.throws(() => verify(`${header}.${body}.${hmac(`${header}.${body}`)}`, SECRET), /algorithm/i);
  });

  test('garbage input is rejected', () => {
    for (const bad of ['', 'abc', 'a.b', 'a.b.c.d', undefined, null, 42]) {
      assert.throws(() => verify(bad, SECRET));
    }
  });
});
