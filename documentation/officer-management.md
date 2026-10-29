# Phase 3: officer management

The officer module now provides a React/TypeScript interface and authenticated Express APIs. It uses Vite, Tailwind, shadcn-style Radix button/alert-dialog components, Router, TanStack Query, React Hook Form, Zod and Lucide icons. Routes are split into separate frontend bundles.

## Available workflows

- Sign in/out with the existing server-side session and CSRF controls. Sensitive query caches are cleared on expiry/sign-out; credentials and record data are never stored in localStorage.
- Register a core officer record, with optional authorized personal/service fields, initial education and explicitly verified initial rank/assignment records.
- Search by name/force number, paginate and sort by name, force number or registration date. Filter administrative record state, archive state, rank and sub-unit; rank/sub-unit filters require the corresponding field read permissions. Unconfigured reference lists stay empty.
- Configure visible optional table columns. Only column-name preferences are kept in localStorage.
- View an officer profile and authorized service, assignment, rank, status, movement, education, course, award, disciplinary and examination sections. Section responses are bounded to 25 records per page. Sensitive related sections require separate backend permissions.
- Edit core personal/service fields. The editor waits for its initial service data before enabling edits, preserves changes during editing and sends only changed fields.
- Archive, restore or bulk-archive up to 50 records. Archive changes `deletedAt` only: personnel status and historical records remain unchanged. Bulk actions are transactional, with consistent lock ordering and all-or-nothing revision checks.

Force numbers are unique strings. Payroll/national identifiers and phone values remain strings, preserving leading zeroes. The backend rejects unknown/mass-assignment fields, impossible date sequences, incomplete/invalid dates, invalid reference IDs, unauthorized sensitive writes and stale record versions. Mutations and profile-section reads write redacted audit metadata containing field names rather than personal values.

Initial rank/assignment entries require `datesVerified: true` plus a complete effective date. User confirmation attests to an authoritative source; the server stamps the authenticated verifier and verification instant. Unknown chronology must stay in import staging. Subsequent rank, assignment and service-status changes belong to the reviewed movement workflow rather than ordinary personal-information editing. No rank, sub-unit, ethnicity, retirement age or inclusion policy is invented or activated by this phase.

A newly registered officer remains `UNVERIFIED`. The directory's counts describe administrative records, not nominal or operational strength. Retirement and strength reporting stay unavailable pending policy approval. The original workbook is still ignored and has not been imported.

## Running the application

From the existing checkout, with the documented local MySQL instance and ignored `.env` configured:

```bash
npm ci --ignore-scripts
npm run db:generate
npm run db:migrate
npm run db:seed  # Explicit fictional-development flags required
npm run build
npm start
```

Express serves the built frontend and authenticated API together. `APP_ORIGIN` must match the address used by the browser; the example configuration matches the default server port. The fictional development login remains documented in [backend-development.md](backend-development.md). Do not expose this development environment as a production personnel service.

For frontend development, run the backend and Vite in separate terminals. Override `APP_ORIGIN` to match Vite's address when starting the backend; Vite proxies `/api` to the backend's default port:

```bash
APP_ORIGIN=http://127.0.0.1:5173 npm run dev
npm run dev:frontend
```

## Officer APIs

| Method / endpoint | Permission / behavior |
| --- | --- |
| GET `/api/officers` | `officers.view`; q/page/pageSize/archive/sort/direction/recordStatus/rankId/subUnitId |
| POST `/api/officers` | `officers.create` plus each supplied sensitive field's `.write` permission |
| GET `/api/officers/:id` | `officers.view`; allowlisted fields only, including record revision |
| PATCH `/api/officers/:id` | `officers.update` and per-field `.write`; requires current `version` |
| DELETE `/api/officers/:id` | `officers.archive`; JSON body `{ version }`; soft archive only |
| POST `/api/officers/:id/restore` | `officers.restore`; JSON body `{ version }` |
| POST `/api/officers/bulk-archive` | `officers.archive`; `{ officers: [{ id, version }] }` |
| GET `/api/officer-options` | `officers.view`; reference lists restricted by field permissions |
| GET `/api/officers/:id/sections/:section` | `officers.view` plus section `.view`; optional page |

All mutations also require the session cookie, exact Origin and current CSRF token. Conflict responses use HTTP 409; reload the current record before retrying. Ordinary edits cannot alter rank/assignment/status history or activate personnel policies. Officer-view permission currently grants register-wide access; operational supervisor scopes remain unapproved and must be implemented before assigning operational supervisor access.

## Validation

```bash
npm test
npm run typecheck
npm run typecheck:frontend
npm run build
npm run test:integration
```

For Chromium E2E testing, use a dedicated migrated `TEST_DATABASE_URL` ending in `_test`. Chromium is available at `/usr/bin/chromium` in the current machine; set `CHROMIUM_PATH` for another installation. In separate terminals:

```bash
npm run test:browser:server
npm run test:browser
```

The browser server refuses to use an unspecified/non-test database. The E2E test creates a unique fictional user/role and officer, verifies registration, leading-zero identifiers, editing, search, archive/restore, mobile navigation, page-width containment and logout/reload, then removes only its own fixtures. Screenshots and browser artifacts remain under ignored `.local/`.

Organization administration is implemented in [Phase 4](organization-management.md). Approval-based personnel movements, calculated reports and reviewed workbook import/export remain subsequent phases. Course/award/disciplinary administration is not implemented by this officer editor; existing entries can be viewed when authorized.
