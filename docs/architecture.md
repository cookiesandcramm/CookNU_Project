# Cook'N U Infrastructure Architecture

## 1. Overview
Cook'N U uses Docker Compose to run its application containers.
Nginx acts as the reverse proxy and the public entry point.

## 2. Current Architecture

Browser
   |
   | HTTP :8080
   v
Nginx Reverse Proxy
   |
   v
Frontend Container
   |
   v
Cook'N U Website

## 3. Current Containers

- Frontend: Serves the Cook'N U website.
- Proxy: Routes browser requests to the frontend and is configured to route /api/ requests to the backend.

## 4. Network and Access

The frontend and proxy communicate through the Docker bridge network named app-network.
Only the proxy publishes a port to the host: 8080.

## 5. Planned Components

The backend services, database container, persistent database volume, and backend health endpoints still need to be integrated and verified against the project requirements.

## 6. Health Checks

The frontend and proxy have Docker health checks configured.
Backend and database health checks will be documented after those services are integrated.
