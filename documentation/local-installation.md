# Run RECCE on your computer

This package runs the current officer and organization modules on localhost. It includes registration, search, editing, profiles, archive/restore, ranks, units, sub-units, verified assignment baselines, deployments, dated approved establishments, authentication, permissions and account password changes.

Personnel-movement approvals, calculated reports, document uploads and workbook import/export are not implemented yet. Retirement/strength policies remain inactive. No workbook or real officer records are included or automatically imported.

## Requirements

- Git, or download and extract the repository ZIP from GitHub.
- Docker Desktop with Linux containers on Windows/macOS, or Docker Engine and Docker Compose v2.20 or newer on Linux. Start Docker before continuing.
- Internet access for the first build. Node.js, Python and MySQL do **not** need to be installed on your computer; they run inside Docker.

On Windows, run the commands in PowerShell or a WSL terminal. Use a regular writable project directory. All application files must be extracted before running Compose.

## First start

```bash
git clone https://github.com/jimwanjiru/recce-squad.git
cd recce-squad
docker compose up --build -d --wait
```

The initial build can take a few minutes. Compose creates the database, generates private credentials in Docker volumes, applies the checked-in migrations and creates one **Local Administrator** account in an otherwise empty register. No default password is shared or committed.

Retrieve your initial login details in your own terminal:

```bash
docker compose exec app node tools/local-access.cjs
```

Open **http://localhost:3000** in your browser and sign in using those details. The administrator email is `admin@recce.local`. Keep the displayed password private. Use **Account settings** to choose your own password of at least 14 characters; this signs out all sessions. The retrieval command recognizes a changed password and never resets it.

Use `localhost` exactly. The application validates the browser's Origin; opening it under a different hostname requires matching configuration. The web port is bound to your computer's loopback interface, and MySQL is not published on a host port.

## Stop and start again

```bash
docker compose stop
```

Later:

```bash
docker compose up -d --wait
```

Your officers, configuration, passwords and sessions remain in Docker volumes. Startup does not recreate accounts, reset passwords, regrant removed role permissions or add fictional officer records. Credentials and database data must be retained together.

For an update, back up your data first, then:

```bash
git pull
docker compose up --build -d --wait
```

Migrations run before the web server starts. Migration failures stop startup and retain their ledger entries for diagnosis. Do not remove the database, edit executed migration files or delete credential volumes to work around a failure.

**Do not use `docker compose down -v` for normal shutdown.** It deletes the database and credential volumes. Removing Docker Desktop's application volumes has the same effect. Keep coordinated backups of all three volumes (`mysql-data`, `mysql-credentials`, `app-credentials`); they contain sensitive data and must be protected. This local package does not configure production backups or disaster recovery for you.

## If port 3000 is already in use

Create `.env` in the project directory with:

```dotenv
LOCAL_HTTP_PORT=8080
LOCAL_APP_ORIGIN=http://localhost:8080
```

Then run `docker compose up -d --wait` again and open **http://localhost:8080**. If `.env` already exists, add/update only those two entries. Other native-development `.env` values are not used as Docker database credentials.

## Check readiness or diagnose startup

```bash
docker compose ps
docker compose logs --tail=100 app
docker compose logs --tail=100 mysql
```

The `app` and `mysql` services should be healthy. The one-shot `initialize` service should exit successfully; it is not a long-running server. Health checks verify an actual database request. Startup logs do not contain passwords. Do not share terminal output from the explicit login-retrieval command.

- **Docker cannot connect:** start Docker Desktop/the Docker daemon and retry.
- **The port is allocated:** use the alternate-port configuration above.
- **A sign-in request reports an address mismatch:** use the hostname/port specified by LOCAL_APP_ORIGIN.
- **Existing accounts are preserved:** this is normal after the first run. Use your current password. The initial-access command does not reset accounts.
- **Database credentials disagree or startup fails after deleting a volume:** restore the matching database and credential-volume backups. The initializer deliberately does not overwrite credentials.
- **A build fails downloading dependencies:** check your Internet/proxy configuration. Do not disable TLS or package integrity checks. A corporate CA may be supplied to Docker builds as the optional `proxy_ca` BuildKit secret; never copy a private credential or a session CA into an image.

## Local security and scope

The application container runs as the unprivileged Node user. Only the MySQL container receives its root-password file. Application and administrator passwords are randomly generated and stored in a separate private volume; credential values are not embedded in Compose environment variables or image layers. `.env`, `.local`, workbook files, generated outputs and Git metadata are excluded from the build context. MySQL data stays in a separate persistent volume.

This Compose configuration is a **local HTTP installation**, not a public production deployment. It uses the existing development-cookie policy (HTTP-only and SameSite Strict), a private database network and disabled local MySQL binary logging so schema-scoped migrations can create triggers without global privileges. Public deployments need reviewed HTTPS, database TLS/accounts, backups, role scopes and approved personnel policies. Do not expose this configuration to the Internet or use real personnel data without organizational approval of storage/access arrangements.

Native developer instructions remain available in [backend-development.md](backend-development.md); they require host Node.js 24, npm, Python and MySQL. The Docker route above is the recommended cross-platform local installation.
