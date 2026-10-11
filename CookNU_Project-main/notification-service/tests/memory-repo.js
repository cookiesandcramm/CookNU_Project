'use strict';
// In-memory stand-in for src/repo.js (same interface, no PostgreSQL needed).
function createMemoryRepo() {
  const rows = [];
  let healthy = true;
  let seq = 0;

  return {
    setHealthy(v) { healthy = v; },
    // test helper: what the recipe-service would have inserted
    seed(userId, text, extra = {}) {
      rows.push({ id: `n${++seq}`, userId, text, actorName: 'Someone', recipeId: null, recipeTitle: 'Dish', read: false, createdAt: new Date(seq * 1000).toISOString(), ...extra });
    },
    async ping() { if (!healthy) throw new Error('database down'); },
    async list(userId, limit) {
      return rows
        .filter((r) => r.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map(({ userId: _u, ...n }) => n);
    },
    async countUnread(userId) { return rows.filter((r) => r.userId === userId && !r.read).length; },
    async markAllRead(userId) {
      const unread = rows.filter((r) => r.userId === userId && !r.read);
      unread.forEach((r) => { r.read = true; });
      return unread.length;
    },
  };
}

module.exports = { createMemoryRepo };
