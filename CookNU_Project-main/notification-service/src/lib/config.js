'use strict';
// Reads configuration from environment variables (set by docker-compose / .env).
function loadConfig(env = process.env) {
  const missing = ['POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'JWT_SECRET'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  if (env.JWT_SECRET.length < 16) throw new Error('JWT_SECRET must be at least 16 characters long');

  return {
    port: Number(env.PORT) || 3000,
    version: env.BUILD_TAG || 'dev',
    jwtSecret: env.JWT_SECRET,
    db: {
      host: env.DB_HOST || 'database',
      port: Number(env.DB_PORT) || 5432,
      database: env.POSTGRES_DB,
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
    },
  };
}

module.exports = { loadConfig };
