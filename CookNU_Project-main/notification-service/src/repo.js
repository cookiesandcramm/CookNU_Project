'use strict';
// All SQL for the notification-service lives here. Rows are created by the
// recipe-service when someone hearts a recipe; this service only reads them.
const toNotification = (row) => ({
  id: row.id,
  text: row.text,
  actorName: row.actor_name,
  recipeId: row.recipe_id,
  recipeTitle: row.recipe_title,
  read: row.is_read,
  createdAt: row.created_at,
});

function createRepo(db) {
  return {
    ping: () => db.ping(),

    async list(userId, limit) {
      const { rows } = await db.query(
        `SELECT id, text, actor_name, recipe_id, recipe_title, is_read, created_at
           FROM notifications
          WHERE user_id = $1
          ORDER BY created_at DESC, id
          LIMIT $2`,
        [userId, limit],
      );
      return rows.map(toNotification);
    },

    async countUnread(userId) {
      const { rows } = await db.query(
        'SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id = $1 AND is_read = FALSE',
        [userId],
      );
      return rows[0].unread;
    },

    // Returns how many notifications were newly marked as read.
    async markAllRead(userId) {
      const result = await db.query(
        'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
        [userId],
      );
      return result.rowCount;
    },
  };
}

module.exports = { createRepo };
