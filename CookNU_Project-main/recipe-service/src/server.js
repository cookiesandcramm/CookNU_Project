'use strict';
const http = require('node:http');
const { loadConfig } = require('./lib/config');
const { createDb } = require('./lib/db');
const { createRepo } = require('./repo');
const { createApp } = require('./app');

const config = loadConfig();
const db = createDb(config.db);
const app = createApp({
  repo: createRepo(db),
  jwtSecret: config.jwtSecret,
  version: config.version,
  log: (line) => console.log(line),
});

const server = http.createServer(app.handler);
server.listen(config.port, '0.0.0.0', () => {
  console.log(`recipe-service ${config.version} listening on :${config.port}`);
});

// Docker sends SIGTERM on "docker compose down/up"; finish in-flight requests first.
function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await db.close().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
