'use strict';
// All SQL for the recipe-service lives here (see db/init.sql for the schema).
// $1 is always the viewer's user id (or NULL for anonymous requests) so each
// recipe can report whether the viewer has already hearted it.
const SELECT_RECIPE = `
  SELECT r.id, r.title, r.categories, r.ingredients, r.instructions,
         r.prep_time_mins, r.servings, r.image, r.created_at, r.updated_at,
         u.id AS author_id, u.name AS author_name, u.avatar AS author_avatar,
         (SELECT COUNT(*)::int FROM recipe_hearts h WHERE h.recipe_id = r.id) AS hearts,
         EXISTS (SELECT 1 FROM recipe_hearts h WHERE h.recipe_id = r.id AND h.user_id = $1) AS hearted_by_me
  FROM recipes r
  JOIN users u ON u.id = r.author_id`;

const toRecipe = (row) => ({
  id: row.id,
  title: row.title,
  category: row.categories.join(','),
  categories: row.categories,
  ingredients: row.ingredients,
  instructions: row.instructions,
  prepTime: row.prep_time_mins,
  servings: row.servings,
  image: row.image || '',
  hearts: row.hearts,
  heartedByMe: row.hearted_by_me,
  author: { id: row.author_id, name: row.author_name, avatar: row.author_avatar },
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// Escape LIKE wildcards so a search for "100%" is literal.
const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

function createRepo(db) {
  return {
    ping: () => db.ping(),

    async list({ viewerId = null, search, categories, authorId, favoritesOnly, limit, offset }) {
      const params = [viewerId];
      const where = [];
      const add = (value) => { params.push(value); return `$${params.length}`; };

      if (search) {
        const p = add(`%${escapeLike(search)}%`);
        where.push(`(r.title ILIKE ${p} OR r.ingredients ILIKE ${p})`);
      }
      if (categories && categories.length) where.push(`r.categories && ${add(categories)}::text[]`);
      if (authorId) where.push(`r.author_id = ${add(authorId)}`);
      if (favoritesOnly) where.push('EXISTS (SELECT 1 FROM recipe_hearts f WHERE f.recipe_id = r.id AND f.user_id = $1)');

      const sql = `${SELECT_RECIPE}
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY r.created_at DESC, r.id
        LIMIT ${add(limit)} OFFSET ${add(offset)}`;
      const { rows } = await db.query(sql, params);
      return rows.map(toRecipe);
    },

    async get(id, viewerId = null) {
      const { rows } = await db.query(`${SELECT_RECIPE} WHERE r.id = $2`, [viewerId, id]);
      return rows[0] ? toRecipe(rows[0]) : null;
    },

    async create(authorId, r) {
      const { rows } = await db.query(
        `INSERT INTO recipes (author_id, title, categories, ingredients, instructions, prep_time_mins, servings, image)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [authorId, r.title, r.categories, r.ingredients, r.instructions, r.prepTime, r.servings, r.image],
      );
      return rows[0].id;
    },

    async update(id, r) {
      const result = await db.query(
        `UPDATE recipes
            SET title = $2, categories = $3, ingredients = $4, instructions = $5,
                prep_time_mins = $6, servings = $7, image = $8, updated_at = now()
          WHERE id = $1`,
        [id, r.title, r.categories, r.ingredients, r.instructions, r.prepTime, r.servings, r.image],
      );
      return result.rowCount === 1;
    },

    async remove(id) {
      const result = await db.query('DELETE FROM recipes WHERE id = $1', [id]);
      return result.rowCount === 1;
    },

    // true if the heart was newly added, false if it already existed.
    async addHeart(recipeId, userId) {
      const result = await db.query(
        'INSERT INTO recipe_hearts (recipe_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [recipeId, userId],
      );
      return result.rowCount === 1;
    },

    async removeHeart(recipeId, userId) {
      const result = await db.query('DELETE FROM recipe_hearts WHERE recipe_id = $1 AND user_id = $2', [recipeId, userId]);
      return result.rowCount === 1;
    },

    async findUser(id) {
      const { rows } = await db.query('SELECT id, name FROM users WHERE id = $1', [id]);
      return rows[0] || null;
    },

    async addNotification({ userId, actorId, recipeId, actorName, recipeTitle, text }) {
      await db.query(
        `INSERT INTO notifications (user_id, actor_id, recipe_id, actor_name, recipe_title, text)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, actorId, recipeId, actorName, recipeTitle, text],
      );
    },
  };
}

module.exports = { createRepo, escapeLike };
