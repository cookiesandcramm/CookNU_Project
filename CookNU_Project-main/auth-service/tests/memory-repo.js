'use strict';
const crypto = require('node:crypto');

// In-memory stand-in for src/repo.js so tests run without PostgreSQL.
function createMemoryRepo() {
  const users = new Map();
  let healthy = true;

  const strip = ({ passwordHash, ...rest }) => rest;

  return {
    setHealthy(value) { healthy = value; },
    async ping() { if (!healthy) throw new Error('database down'); },
    async findByEmail(email) {
      return [...users.values()].find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
    },
    async findById(id) {
      const u = users.get(id);
      return u ? strip(u) : null;
    },
    async create({ name, email, passwordHash }) {
      if ([...users.values()].some((u) => u.email === email)) {
        const err = new Error('duplicate key');
        err.code = '23505';
        throw err;
      }
      const user = { id: crypto.randomUUID(), name, email, avatar: null, createdAt: new Date().toISOString(), passwordHash };
      users.set(user.id, user);
      return strip(user);
    },
    async update(id, { name, avatar }) {
      const u = users.get(id);
      if (!u) return null;
      Object.assign(u, { name, avatar });
      return strip(u);
    },
    async remove(id) { return users.delete(id); },
  };
}

module.exports = { createMemoryRepo };
