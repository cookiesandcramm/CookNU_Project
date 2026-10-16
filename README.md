# Cook'N U — Recipe Management System

## Project Overview

Cook'N U is a web-based recipe management application. The project demonstrates how frontend and backend services, a PostgreSQL database, Docker containers, an Nginx reverse proxy, and Jenkins CI/CD can work together to deliver and maintain a web application.

This project is developed for the SYSIN Final Project, focusing on containerization, automated testing, deployment, data persistence, and recovery.

## Architecture

The application uses separate containers for the frontend, backend, reverse proxy, and PostgreSQL database. Jenkins runs separately from the main application stack and manages the CI/CD pipeline.

### Architecture Diagram

See [`docs/architecture.png`](docs/architecture.png) for the project architecture diagram.

### Components

| Component | Purpose |
|---|---|
| Frontend | Provides the user interface for viewing and interacting with recipes. |
| Backend | Handles application requests and database communication. |
| Nginx Reverse Proxy | Provides a single entry point and routes requests to the appropriate service. |
| PostgreSQL | Stores application data persistently. |
| Docker Compose | Defines and coordinates the application containers, networking, and storage. |
| Jenkins | Automates source checkout, testing, image building, deployment, and smoke testing. |
| GitHub | Hosts the source code and tracks project changes. |

### Request Flow

1. The user accesses the application through the browser at `http://localhost:8080`.
2. Nginx receives the request through the published application port.
3. Requests for the web interface are forwarded to the frontend.
4. API requests are forwarded to the backend according to the proxy configuration.
5. The backend communicates with PostgreSQL when database operations are required.
6. Jenkins checks the source repository and executes the configured pipeline when changes are detected.

## Technology Stack

- HTML, CSS, and JavaScript — frontend.
- Node.js — backend runtime.
- Nginx — reverse proxy.
- PostgreSQL — relational database.
- Docker and Docker Compose — containerization and service orchestration.
- Jenkins — continuous integration and deployment.
- Git and GitHub — version control and source code hosting.

## Project Structure

```text
CookNU_Project/
├── frontend/
│   ├── index.html
│   ├── app.css
│   ├── app.js
│   ├── ui.js
│   ├── Dockerfile
│   └── .dockerignore
├── backend/
├── proxy/
│   └── nginx.conf
├── infra/
│   └── jenkins/
├── docs/
│   ├── architecture.md
│   └── architecture.png
├── docker-compose.yml
├── Jenkinsfile
├── .env.example
├── .gitignore
└── README.md
```

*Note: The structure above summarizes the main project files. Individual folders may contain additional files.*

## Prerequisites

Before running the project, install:

- Docker Desktop with the Docker Engine running.
- Git.
- A modern web browser.
- Visual Studio Code (recommended for editing the project).

Verify your installations:

```bash
docker version
docker compose version
git --version
```

## Environment Configuration

1. Open the project root directory.
2. If `.env` does not exist, create it using `.env.example` as a reference.
3. Configure the required database and application environment variables according to the Compose configuration.
4. Keep actual passwords and private credentials in local environment files or Jenkins Credentials.

Do not commit `.env` or expose real passwords in the repository. The `.env.example` file should contain placeholders, not actual secrets.

## Running the Application Locally

### Option 1: VS Code Live Server

For frontend-only development, open `frontend/index.html` and launch it with the Live Server extension.

Some features that require backend services, API routing, or the production-like proxy may not work correctly when the frontend is opened directly through Live Server.

### Option 2: Docker Compose

From the repository root, run:

```bash
docker compose -p cooknu_project up -d --build
```

Check the containers:

```bash
docker compose -p cooknu_project ps
```

Open the application:

**http://localhost:8080**

Verify that the page loads, existing recipes are visible, and opening a recipe works.

### Viewing Logs

```bash
docker compose -p cooknu_project logs -f
```

Press `Ctrl+C` to stop following the logs. The containers continue running.

### Stopping the Application

```bash
docker compose -p cooknu_project down
```

This stops and removes the Compose-managed containers and network but normally preserves the named database volume.

Do not use `docker compose down -v` when you need to preserve database data.

## Jenkins Setup

Jenkins is configured separately from the main application stack using the files in `infra/jenkins/`.

### Start Jenkins

Make sure Docker Desktop or the Docker Engine is running. From the repository root, run:

```bash
cd infra/jenkins
docker compose up -d --build
```

Retrieve the initial administrator password if Jenkins has not yet been initialized:

```bash
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Open Jenkins:

**http://localhost:8081**

Follow the initial setup instructions, install the recommended plugins, install the Docker Pipeline plugin if needed, and create an administrator account.

Jenkins uses persistent storage for its home directory so its configuration and job data can survive container restarts.

## Jenkins Pipeline Configuration

The pipeline is defined in the root `Jenkinsfile`.

Create a Jenkins Pipeline job with these settings:

- **Job name:** `CookNU-Pipeline`
- **Definition:** Pipeline script from SCM
- **SCM:** Git
- **Repository URL:** `https://github.com/cookiesandcramm/CookNU_Project.git`
- **Branch:** `*/main`
- **Script path:** `Jenkinsfile`

If the repository is private, configure the required Git credentials in Jenkins.

The database password credential is configured in Jenkins as `cooknu-postgres-password`. Store secret values in Jenkins Credentials instead of hardcoding them in the Jenkinsfile.

### Pipeline Stages

The Jenkinsfile defines the following stages:

1. **Checkout** — Retrieves the source code from the configured Git repository.
2. **Test** — Performs the currently configured frontend file and HTML-reference checks.
3. **Build Images** — Builds the Docker images for the configured services.
4. **Deploy** — Updates the application stack using Docker Compose.
5. **Smoke Test** — Checks whether the application responds through the reverse proxy.

Jenkins reports the build result after the pipeline completes.

### Automatic Pipeline Trigger

The Jenkinsfile configures Poll SCM:

```groovy
triggers {
    pollSCM('H/2 * * * *')
}
```

This tells Jenkins to check the repository approximately every two minutes, subject to Jenkins scheduling.

To verify automatic triggering:

1. Make a small, visible change to a tracked project file.
2. Commit and push the change to the `main` branch.
3. Do not click **Build Now**.
4. Wait for Jenkins to detect the new commit.
5. Confirm that a new pipeline build starts automatically.
6. Verify that the updated version is deployed.

A successful manual build does not, by itself, prove that automatic triggering is working.

**Automatic Trigger Verification Result**

Jenkins Poll SCM was verified successfully. After commit `c2132be` (`Test automatic Jenkins trigger`) was pushed to the `main` branch, Jenkins detected the change and automatically started Build #6 without manually selecting **Build Now**. The build details showed **Started by an SCM change**, and the pipeline completed with **SUCCESS**.

## Testing and Quality Assurance

The current pipeline includes basic frontend checks and an HTTP smoke test.

The following checks should be completed and documented before final submission:

- Verify that the frontend loads through the reverse proxy.
- Verify that recipe viewing works.
- Verify backend health and database connectivity.
- Confirm that database records persist after a normal restart or redeployment.
- Demonstrate that a failing automated test blocks deployment.
- Confirm that the previously running application remains available when a test fails.
- Demonstrate rollback to a previously built image version.

**Current limitation:** The existing Test stage checks frontend files and HTML references. These checks should not be described as a complete automated test suite. The failing-test gate, persistence, and rollback demonstrations require separate verification and evidence.

### Failed-Test Gate Verification

The deployment gate was tested using Jenkins Build #8. A temporary intentional failure (`exit 1`) was added after the existing frontend checks in the Test stage. Jenkins correctly marked the Test stage as failed and skipped Build Images, Deploy, and Smoke Test. This verified that a failed test prevents the pipeline from proceeding to deployment. The temporary failure was removed after verification.

Evidence: Jenkins Build #8 Stage View and Test stage console log.

## Data Persistence and Rollback

PostgreSQL should use a named Docker volume to preserve data when database containers are recreated.

To verify persistence, create or update a recipe, restart or redeploy the application without deleting the database volume, and confirm that the data remains available.

For rollback, use a previously built image tag and the team's tested recovery procedure. Record the commands, outcome, and supporting screenshots in the technical documentation.

### Rollback Verification

The application was switched from image tag `:9` to `:7` using Docker Compose. The frontend, backend, reverse proxy, and database were healthy after the rollback. The existing named database volume was retained. Browser functionality and previously saved recipe data were checked after deployment.

**Evidence:**
- `docs/screenshots/rollback-build7-containers.png` — container health and image tags.
- `docs/screenshots/rollback-build7-app.png` — application running after rollback.
- `docs/screenshots/rollback-build7-recipes.png` — previously saved recipes after rollback.

*Note: Confirm application functionality and data persistence before reporting these checks as passed.*

## Team Members and Responsibilities

Replace the placeholders with your actual team members and their assigned roles.

| Team Member | Role | Responsibilities |
|---|---|---|
| [Alex Von Flue] | Project Lead / Scrum Master | Coordinates the team, tracks progress, and organizes the project demonstration. |
| [Alex Von Flue] | DevOps / CI-CD Engineer | Configures Jenkins, pipeline automation, credentials, and triggers. |
| [Katleen Nachor] | Infrastructure Engineer | Manages Dockerfiles, Compose services, networking, volumes, and health checks. |
| [Rhian Mortega] | Backend and Database Engineer | Handles backend functionality, database integration, and backend testing. |
| [Lyanna Ramos] | Frontend, QA, and Documentation Lead | Maintains the frontend, verifies application behavior, supports testing, maintains the README and technical documentation, and prepares presentation slides. |

## Security Considerations

- Do not commit passwords, private credentials, or other secrets.
- Keep `.env` excluded from version control.
- Use Jenkins Credentials to provide secrets to pipeline jobs.
- Review Firebase Security Rules and provider restrictions for client-side Firebase configuration.
- Treat public client-side keys differently from private server credentials, but never assume that a client-visible key protects the underlying data.
- Mounting the Docker socket into Jenkins grants powerful control over the Docker host. This setup should only be used in the controlled classroom environment described by the project guide, not as a production security configuration.

## Project Status

The application has been run locally, and a Jenkins pipeline build has completed successfully.

Automatic triggering, comprehensive automated tests that block deployment, database persistence evidence, and rollback evidence must be verified and documented before the project is considered fully compliant with the final-project requirements.

## Repository

GitHub: https://github.com/cookiesandcramm/CookNU_Project

