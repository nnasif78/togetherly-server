# Togetherly API

Express 5 API deployed as a Vercel Node.js function. The root `index.js` exports the Express app for Vercel; `dev.js` starts the same app with `app.listen()` for local development.

## Local development

Create a local `.env` file with the required values below, then run:

```sh
npm install
npm run dev
```

The local API listens on port `5000` by default. Set `PORT` to override it. The CORS allowlist includes `http://localhost:3000` and the configured `CLIENT_URL` origin.

## Vercel project settings

Import this backend as its own Vercel project and use the directory containing this `package.json` as the **Root Directory**. If this folder is the Git repository root, use `.`.

- **Framework Preset:** Express (Vercel should detect the root Express app automatically).
- **Node.js Version:** `24.x` (also declared in `package.json`; MongoDB Node.js driver 7 requires Node.js 20.19 or newer).
- **Install Command:** default (`npm install`).
- **Build Command:** leave unset; this backend has no build step.
- **Output Directory:** leave unset; Vercel serves the Express function directly.
- **Development Command:** `npm run dev` for local use; do not use this as the deployed entry point.

The root `index.js` is the Vercel Express entry point and default-exports the app. Vercel routes requests to the single Express function, where Express matches the original root paths (`/events`, `/recent-events`, etc.). No `/api` rewrite or catch-all function is configured, so Vercel function routing does not shadow these API routes. `vercel.json` contains only the Vercel schema and intentionally has no legacy `builds` or `routes` rules.

## Environment variables

Set these in **Vercel Project Settings → Environment Variables** for every environment that should run (Production, Preview, and/or Development). Values are intentionally not included in this repository.

| Name | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Yes | Secret connection string for the existing MongoDB deployment. |
| `DATABASE_NAME` | Yes | Name of the existing Togetherly database. |
| `CLIENT_URL` | Yes | The exact frontend base URL expected for Better Auth JWT issuer and audience validation. Match the Better Auth URL exactly, including its trailing-slash format. Its normalized origin is allowed by CORS, and its `/api/auth/jwks` endpoint supplies verification keys. |
| `PORT` | Local only | Optional local Express port; defaults to `5000`. Vercel supplies its own function request handling. |

Use the same `CLIENT_URL` value Better Auth uses for its JWT issuer/audience. Configure it separately for Preview if Preview tokens are issued by a different frontend URL. Do not put secrets in source files or commit local `.env` files.

## Routes and data

The app preserves its existing root-level routes and Express route order, including `/events/by-slug/:slug` before `/events/:id`. Public event reads remain public. JWT-protected event creation, editing, deletion, joining, and joined-event routes continue using `verifyToken`.

MongoDB is connected lazily through one module-level `MongoClient` and a cached connection promise. The driver/client is retained across warm invocations and reuses its connection pool. The root health response does not require a database connection. This setup does not create, migrate, clear, or seed collections or documents.

Before deploying, ensure the MongoDB deployment's network access rules allow connections from the Vercel runtime. Vercel outbound IPs may not be fixed unless the account/project has a suitable static egress option configured.
