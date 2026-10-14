'use strict';
// All SQL for the auth-service lives here. app.js only talks to this interface,
// which is what lets the unit tests swap in an in-memory repository.
const COLUMNS = 'id, name, email, avatar, created_at';

const toUser = (row) => row && ({
  id: row.id,
  name: row.name,
  email: row.email,
  avatar: row.avatar,
  createdAt: row.created_at,
  ...(row.password_hash !== undefined ? { passwordHash: row.password_hash } : {}),
});

function createRepo(db) {
  return {
    ping: () => db.ping(),

    async findByEmail(email) {
      const { rows } = await db.query(
        `SELECT ${COLUMNS}, password_hash FROM users WHERE lower(email) = lower($1)`,
        [email],
      );
      return toUser(rows[0]) || null;
    },

    async findById(id) {
      const { rows } = await db.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
      return toUser(rows[0]) || null;
    },

    async create({ name, email, passwordHash }) {
      const { rows } = await db.query(
        `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
        [name, email, passwordHash],
      );
      return toUser(rows[0]);
    },

    async update(id, { name, avatar }) {
      const { rows } = await db.query(
        `UPDATE users SET name = $2, avatar = $3, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
        [id, name, avatar],
      );
      return toUser(rows[0]) || null;
    },

    // ON DELETE CASCADE removes the user's recipes, hearts and notifications too.
    async remove(id) {
      const result = await db.query('DELETE FROM users WHERE id = $1', [id]);
      return result.rowCount === 1;
    },
  };
}

module.exports = { createRepo };
