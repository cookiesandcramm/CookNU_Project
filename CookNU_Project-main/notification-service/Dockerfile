# ---- base: install ALL dependencies (dev + prod) and copy the source ----------
FROM node:22-alpine AS base
WORKDIR /app
# Dependency manifests first, so this layer is cached until they change.
COPY package*.json ./
# "npm ci" is used when package-lock.json is committed (reproducible installs).
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .

# ---- test: run by Jenkins with "docker build --target test ./notification-service" --------------
# If any unit test fails, this build step fails and the pipeline stops before Deploy.
FROM base AS test
ENV NODE_ENV=test
RUN npm test

# ---- production: small runtime image, production dependencies only ------------
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3003
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
    && npm cache clean --force
COPY src ./src
# Never run as root inside the container (the "node" user ships with the image).
USER node
EXPOSE 3003
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:3003/health || exit 1
CMD ["node", "src/server.js"]
