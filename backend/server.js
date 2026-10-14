const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const db = new Pool({
  host: process.env.DB_HOST || "database",
  port: 5432,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD
});

app.get("/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.status(200).json({ status: "healthy", database: "connected" });
  } catch {
    res.status(503).json({ status: "unhealthy" });
  }
});

app.get("/api/contacts", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, name, phone FROM contacts ORDER BY id"
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Could not retrieve contacts" });
  }
});

app.post("/api/contacts", async (req, res) => {
  const { name, phone } = req.body || {};

  if (typeof name !== "string" || !name.trim() ||
      typeof phone !== "string" || !phone.trim()) {
    return res.status(400).json({ error: "Name and phone are required" });
  }

  try {
    const result = await db.query(
      "INSERT INTO contacts (name, phone) VALUES ($1, $2) RETURNING id, name, phone",
      [name.trim(), phone.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Could not save contact" });
  }
});

async function start() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      phone VARCHAR(50) NOT NULL
    )
  `);

  app.listen(3000, "0.0.0.0", () => {
    console.log("CookNU backend running on port 3000");
  });
}

start().catch(error => {
  console.error("Backend startup failed:", error);
  process.exit(1);
});
