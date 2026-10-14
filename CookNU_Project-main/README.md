# Cook'N U — cleaned VS Code project

## What changed
- `frontend/index.html`: page structure only.
- `frontend/app.css`: styles moved out of the HTML.
- `frontend/app.js`: original Firebase/application module JavaScript.
- `frontend/ui.js`: small bottom-page UI script.
- `frontend/Dockerfile` and `.dockerignore`: frontend container.
- `proxy/`: Nginx reverse proxy.
- `docker-compose.yml`: local frontend + proxy stack.
- `infra/jenkins/`: Jenkins Docker setup, separate from the app.
- `Jenkinsfile`: Checkout, Test, Build Images, Deploy, Smoke Test stages.

## Run the site locally
Open this folder in VS Code and use Live Server on `frontend/index.html`, or use Docker:
```bash
docker compose up -d --build
```
Then open http://localhost:8080.

## Start Jenkins (Docker Desktop / Docker Engine required)
From the repository root:
```bash
cd infra/jenkins
docker compose up -d --build
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```
Open http://localhost:8081, unlock Jenkins, install suggested plugins and install **Docker Pipeline**. Create an admin account.

Return to the root application folder for app commands:
```bash
docker compose ps
docker compose down
```

## Jenkins job
Create a Pipeline job configured as **Pipeline script from SCM**, select your Git repository and branch, and set Script Path to `Jenkinsfile`. Configure Git credentials in Jenkins if the repository is private. The Jenkinsfile uses Poll SCM every two minutes as a fallback; for a webhook, configure the Git provider and enable the matching webhook trigger in the job.

## Important limitations to finish as a group
This starter is not yet the complete final-project specification. The PDF requires at least **three application modules**, a database with a named persistent volume, at least one backend `/health` endpoint, automated backend tests that gate deployment, and rollback proof. This starter currently packages the existing frontend and a proxy only. Add your team's backend/database services, health checks, tests, and route rules to `docker-compose.yml` and `proxy/nginx.conf` before submission.

The existing frontend contains Firebase configuration and an EmailJS public key. Do not commit private server credentials or passwords. Firebase web API keys are commonly client-visible, but review Firebase Security Rules and provider restrictions. Rotate any secret credentials if private credentials were accidentally exposed.

## Jenkins Docker socket warning
Mounting `/var/run/docker.sock` and running Jenkins as root gives Jenkins powerful control over the host's Docker daemon. The course PDF permits this for a classroom lab only. Do not use this setup as-is for a production environment.
