
const fs = require("fs");
const { Pool } = require("pg");

const filePath = "/tmp/cooknu-firebase-recipes.json";
const recipes = JSON.parse(fs.readFileSync(filePath, "utf8"));

const pool = new Pool({
  host: process.env.DB_HOST || "database",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Keep the original Firebase document ID for each imported recipe.
    await client.query(`
      ALTER TABLE recipes
      ADD COLUMN IF NOT EXISTS firebase_id TEXT
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS recipes_firebase_id_unique
      ON recipes (firebase_id)
      WHERE firebase_id IS NOT NULL
    `);

    let imported = 0;
    let skipped = 0;

    for (const recipe of recipes) {
      if (!recipe.firebaseId || !recipe.authorId ||
          !recipe.authorName || !recipe.title) {
        console.warn("Skipping a recipe with missing required fields.");
        skipped++;
        continue;
      }

      const result = await client.query(
        `INSERT INTO recipes (
          firebase_id, "authorId", "authorName", "authorAvatar",
          title, category, ingredients, instructions, "prepTime",
          servings, image, hearts, hearts_by, "createdAt", "updatedAt"
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, COALESCE($14, NOW()), $15
        )
        ON CONFLICT (firebase_id) WHERE firebase_id IS NOT NULL
        DO NOTHING
        RETURNING id`,
        [
          recipe.firebaseId,
          recipe.authorId,
          recipe.authorName,
          recipe.authorAvatar || null,
          recipe.title,
          recipe.category || null,
          recipe.ingredients || null,
          recipe.instructions || null,
          recipe.prepTime || null,
          recipe.servings == null ? null : String(recipe.servings),
          recipe.image || null,
          Number.isFinite(Number(recipe.hearts))
            ? Number(recipe.hearts) : 0,
          Array.isArray(recipe.hearts_by) ? recipe.hearts_by : [],
          toDate(recipe.createdAt),
          toDate(recipe.updatedAt),
        ]
      );

      if (result.rowCount > 0) imported++;
      else skipped++;
    }

    await client.query("COMMIT");

    const count = await client.query(
      "SELECT COUNT(*)::int AS total FROM recipes"
    );

    console.log(`Recipes in export: ${recipes.length}`);
    console.log(`New recipes imported: ${imported}`);
    console.log(`Already present or skipped: ${skipped}`);
    console.log(`Total recipes now in PostgreSQL: ${count.rows[0].total}`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed; database changes were rolled back.");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
