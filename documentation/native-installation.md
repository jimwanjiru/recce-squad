# Run on localhost without Docker

Install **Node.js 24 LTS** (includes npm) and **MySQL Community Server 8.4 LTS**, or use your existing **MariaDB 10.11** server directly on your laptop. Git is optional if you download/extract the GitHub ZIP. You do not need Python, Bash, Docker, MySQL Workbench or a separate frontend server. Windows PowerShell, macOS Terminal and Linux terminals use the same npm commands below. Windows may require `npm.cmd` if PowerShell blocks `npm.ps1`.

This starts the current officer and organization modules. Movement approvals, calculated reports, document uploads and workbook import/export remain pending. No real officer data is included and personnel policies stay inactive.

## 1. Install and prepare MySQL

Install MySQL Server as a local service, use port **3306**, and keep the root password private. On Windows, choose a minimal server installation; Workbench is not necessary. Start the MySQL service. Open MySQL's command-line client as root (or `mysql -u root -p` if it is on your PATH).

Run the following SQL, replacing the example password with your own strong, unique database password. Use a password without SQL quote characters for this manual step. This is separate from your application login.

```sql
CREATE DATABASE recce_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'recce_local'@'127.0.0.1' IDENTIFIED BY 'REPLACE_WITH_YOUR_DATABASE_PASSWORD';
GRANT ALL PRIVILEGES ON recce_local.* TO 'recce_local'@'127.0.0.1';
```

Some MySQL installations resolve loopback clients to `localhost`. If connection fails with access denied for `recce_local@localhost`, create the same local account/grant for `'recce_local'@'localhost'` using the same password. Do not use the root account in the application.

Migrations create database triggers. With binary logging enabled, MySQL may report error 1419. For this dedicated local installation, a MySQL administrator can run:

```sql
SET PERSIST log_bin_trust_function_creators = 1;
```

This trusts stored-function/trigger creators across this MySQL server. Use it only on your own dedicated local server; on a shared or managed server ask its administrator to configure migration privileges. No application command changes this server setting automatically. The app account's grants above are restricted to `recce_local`.

## 2. Download and configure

```bash
git clone https://github.com/jimwanjiru/recce-squad.git
cd recce-squad
npm ci --ignore-scripts
npm run local:configure
```

The setup asks for your MySQL port, database, account and password, verifies the connection, and saves `.env` and `.local/native-access.json`. Password input is visible: use a private terminal. These files are excluded from Git; keep them private. Restrict their Windows file permissions to your own account if your project folder is shared. Setup never overwrites existing configuration. If `.env` already exists, setup verifies its local database connection and creates only missing native access configuration. Existing accounts and passwords are preserved.

## 3. Build once and run

```bash
npm run local:build
npm run local:start
```

The build needs Internet access for the earlier dependency installation, but no native Prisma engine download. Startup applies the checked-in migrations and initializes one Local Administrator only if there are no accounts. It does not import the workbook, add officers, reset existing passwords or regrant removed permissions. Keep the server terminal open.

In another terminal, open the same project folder and run:

```bash
npm run local:access
```

Open **http://localhost:3000**. Sign in with the displayed email (`admin@recce.local`) and generated password. Change the password in **Account settings** (at least 14 characters). The access command never resets a changed password.

## Daily use and updates

Start the MySQL service, open a terminal in the project folder, and run:

```bash
npm run local:start
```

Open http://localhost:3000. Stop the app with **Ctrl+C**. You do not need to rebuild for daily use. One Node.js process serves the compiled interface and API; MySQL runs separately. Closing the app does not delete your data. Docker can remain uninstalled/stopped.

For updates, back up the database and private configuration first, then run `git pull`, `npm ci --ignore-scripts`, `npm run local:build` and `npm run local:start`. Keep your database, `.env` and `.local` folder; never edit previously executed migration SQL or delete migration ledger entries to bypass an error. Database backups require a MySQL dump/backup; copying the project folder alone does not back up officers. Protect backups as sensitive information.

## Troubleshooting

- **Node version:** `node --version` must show v24. Restart the terminal after installing Node.
- **Cannot connect / ECONNREFUSED:** start the MySQL service and check its port. Use 3306 for a normal native installation.
- **Access denied / unknown database:** check that the database and account were created as above. Configuration only writes files after the connection succeeds.
- **Port 3000 in use:** change both `PORT=8080` and `APP_ORIGIN=http://localhost:8080` in `.env`, restart and use that address.
- **Address mismatch:** use `localhost` and the configured port exactly, rather than `127.0.0.1` in the browser.
- **Migration error:** stop and diagnose the first error; a failed migration deliberately blocks automatic retries. Do not reset the database.
- **Missing compiled files:** run `npm run local:build` before starting or retrieving initial access.
- **Native dependency install failure:** use the supported Node 24 release and your platform's supported architecture. Do not disable TLS verification.

The server binds to your laptop's loopback address only. This is a local HTTP installation, not a public deployment. Production use still needs reviewed HTTPS, database permissions/TLS, backups and approved personnel policies.


## MariaDB 10.11 and the original failed constraints migration

The migration runner detects MariaDB and translates the isolation-variable reference to `@@tx_isolation` at execution time. Checked-in SQL and ledger checksums stay unchanged. MySQL retains `@@transaction_isolation`.

If an older release applied `20261029190000_foundation` then failed `20261029190100_constraints` with `ER_UNKNOWN_SYSTEM_VARIABLE`, stop the application and make a database backup first. Update the project files while preserving `.env` and `.local`, then run:

```bash
npm ci --ignore-scripts
npm run db:recover:mariadb
npm run local:build
npm run local:start
```

Recovery runs under the migration lock. It checks the original checksum, requires a single failed constraints entry with no later migration entries, verifies all 11 existing check definitions, and requires that the eight expected triggers are absent before creating them. It completes the existing ledger entry only after those triggers succeed, then applies remaining migrations. It does not drop tables, delete records or erase failed ledger entries. Unexpected/partially different schemas are refused for manual review. This explicit recovery command is restricted to nonproduction MariaDB; normal startup never bypasses a failed migration automatically.

This path was verified on MariaDB 10.11.16 by reproducing the original failure, recovering without losing a sentinel record, rerunning migrations and running the 34 database/API integration tests. MySQL 8.4 remains the Docker default.
