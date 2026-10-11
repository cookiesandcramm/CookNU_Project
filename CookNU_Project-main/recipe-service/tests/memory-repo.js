'use strict';
const crypto = require('node:crypto');

// In-memory stand-in for src/repo.js (same interface, no PostgreSQL needed).
function createMemoryRepo() {
  const users = new Map();
  const recipes = new Map();
  const hearts = new Set(); // "recipeId:userId"
  const notifications = [];
  let healthy = true;
  let clock = 0; // strictly increasing so "newest first" ordering is deterministic

  const view = (r, viewerId) => {
    const author = users.get(r.authorId);
    return {
      id: r.id,
      title: r.title,
      category: r.categories.join(','),
      categories: [...r.categories],
      ingredients: r.ingredients,
      instructions: r.instructions,
      prepTime: r.prepTime,
      servings: r.servings,
      image: r.image || '',
      hearts: [...hearts].filter((h) => h.startsWith(`${r.id}:`)).length,
      heartedByMe: viewerId ? hearts.has(`${r.id}:${viewerId}`) : false,
      author: { id: author.id, name: author.name, avatar: author.avatar || null },
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  };

  return {
    // --- test helpers ---
    setHealthy(v) { healthy = v; },
    addUser(name, id = crypto.randomUUID()) {
      const user = { id, name, avatar: null };
      users.set(user.id, user);
      return user;
    },
    deleteUser(id) { users.delete(id); },
    notifications,

    // --- repository interface ---
    async ping() { if (!healthy) throw new Error('database down'); },

    async list({ viewerId = null, search, categories, authorId, favoritesOnly, limit, offset }) {
      let rows = [...recipes.values()];
      if (search) {
        const s = search.toLowerCase();
        rows = rows.filter((r) => r.title.toLowerCase().includes(s) || r.ingredients.toLowerCase().includes(s));
      }
      if (categories && categories.length) rows = rows.filter((r) => r.categories.some((c) => categories.includes(c)));
      if (authorId) rows = rows.filter((r) => r.authorId === authorId);
      if (favoritesOnly) rows = rows.filter((r) => hearts.has(`${r.id}:${viewerId}`));
      rows.sort((a, b) => b.seq - a.seq);
      return rows.slice(offset, offset + limit).map((r) => view(r, viewerId));
    },
    async get(id, viewerId = null) {
      const r = recipes.get(id);
      return r ? view(r, viewerId) : null;
    },
    async create(authorId, data) {
      const now = new Date().toISOString();
      const r = { id: crypto.randomUUID(), authorId, ...data, createdAt: now, updatedAt: now, seq: ++clock };
      recipes.set(r.id, r);
      return r.id;
    },
    async update(id, data) {
      const r = recipes.get(id);
      if (!r) return false;
      Object.assign(r, data, { updatedAt: new Date().toISOString() });
      return true;
    },
    async remove(id) {
      for (const h of [...hearts]) if (h.startsWith(`${id}:`)) hearts.delete(h);
      return recipes.delete(id);
    },
    async addHeart(recipeId, userId) {
      const key = `${recipeId}:${userId}`;
      if (hearts.has(key)) return false;
      hearts.add(key);
      return true;
    },
    async removeHeart(recipeId, userId) { return hearts.delete(`${recipeId}:${userId}`); },
    async findUser(id) {
      const u = users.get(id);
      return u ? { id: u.id, name: u.name } : null;
    },
    async addNotification(n) { notifications.push(n); },
  };
}

module.exports = { createMemoryRepo };
