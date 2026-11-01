# Togetherly API

> The data and event API behind [Togetherly](https://togetherlyhub.vercel.app/), a community events app for finding, joining, and organizing local volunteer gatherings.

[![Live API](https://img.shields.io/badge/Live%20API-togetherly--server--theta.vercel.app-35c9a9?style=for-the-badge)](https://togetherly-server-theta.vercel.app/)
[![Frontend](https://img.shields.io/badge/Frontend-Togetherly-111111?style=for-the-badge&logo=vercel)](https://togetherlyhub.vercel.app/)
[![Runtime](https://img.shields.io/badge/Node.js-24.x-43853d?style=for-the-badge&logo=nodedotjs)](https://nodejs.org/)

## Explore

- [Open Togetherly](https://togetherlyhub.vercel.app/)
- [Browse events](https://togetherlyhub.vercel.app/events)
- [Check API health](https://togetherly-server-theta.vercel.app/)
- [Open the frontend repository](https://github.com/nnasif78/togetherly-client)

<details>
<summary><strong>Contents</strong></summary>

- [What the API provides](#what-the-api-provides)
- [Technology](#technology)
- [Architecture](#architecture)
- [API reference](#api-reference)
- [Event data](#event-data)
- [Authentication](#authentication)
- [Run locally](#run-locally)
- [Environment variables](#environment-variables)
- [Deploy to Vercel](#deploy-to-vercel)
- [Project files](#project-files)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

</details>

## What the API provides

Togetherly Server is an Express 5 API deployed as a Vercel Node.js function. It stores events in MongoDB and exposes public event catalogue, recent-event, and event-detail reads, plus authenticated organizer and attendee actions. The frontend uses Better Auth to sign users in and sends a JWT when it calls a protected route.

## Technology

| Area | Technologies |
| --- | --- |
| Runtime and package manager | Node.js `24.x`, npm, ES modules |
| HTTP API | Express `5.3`, Vercel Node.js functions |
| Database | MongoDB, `mongodb` Node.js driver |
| Authentication | Better Auth JWTs, `jose` for signature and claim verification, remote JWKS |
| Middleware and configuration | `cors`, `dotenv` |
| Local development | `nodemon` (development dependency), Node.js `dev.js` entry point |
| Related client | Next.js App Router, React, TypeScript, Better Auth; see the [client technology list](https://github.com/nnasif78/togetherly-client#technology) |

## Architecture

```mermaid
flowchart LR
    Browser[Next.js client] -->|public event reads / Bearer JWT| API[Express API]
    API -->|verify JWT signature and claims| Auth[Better Auth JWKS]
    API --> DB[(MongoDB events)]
    Browser -->|sign in and account data| Auth
```

`index.js` exports the Express app for Vercel and `dev.js` starts the same app locally. MongoDB is connected lazily and the module-level client and connection promise are reused across warm function invocations. `GET /` is a simple health response and does not require MongoDB. The data layer does not create, migrate, clear, or seed collections or records.

## API reference

The deployed base URL is `https://togetherly-server-theta.vercel.app`. Routes are at the root (for example, `/events`), not under `/api`.

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/` | Public | Health check. Returns `Togetherly API is running`. |
| `GET` | `/events` | Public | Upcoming events ordered by date, soonest first. |
| `GET` | `/recent-events` | Public | Up to six upcoming events ordered by date. |
| `GET` | `/events/by-slug/:slug` | Public | Find an event using its normalized title and UTC date, e.g. `park-cleanup-2026-11-10`. |
| `GET` | `/events/:id` | Public | Find a single event by MongoDB ObjectId. |
| `GET` | `/my-events` | JWT required | Events created by the authenticated user. |
| `GET` | `/joined-events` | JWT required | Events joined by the authenticated user, ordered by date. |
| `POST` | `/events` | JWT required | Create an event. |
| `PUT` | `/events/:id` | JWT required; owner only | Update an event owned by the authenticated user. |
| `DELETE` | `/events/:id` | JWT required; owner only | Delete an event owned by the authenticated user. |
| `POST` | `/events/:id/join` | JWT required | Join an event if it has space and the user has not joined already. |

The slug route is registered before `/events/:id` so that `by-slug` is interpreted as a slug lookup, not as an ID. If multiple events share the same title and date, slug lookup returns `409` because the URL is ambiguous.

### Request examples

<details>
<summary><strong>Read upcoming events</strong></summary>

```bash
curl https://togetherly-server-theta.vercel.app/events \
  -H 'Authorization: Bearer YOUR_BETTER_AUTH_JWT'
```

Returns a JSON array of upcoming event records.

</details>

<details>
<summary><strong>Create an event</strong></summary>

```bash
curl -X POST https://togetherly-server-theta.vercel.app/events \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_BETTER_AUTH_JWT' \
  -d '{
    "title": "Neighborhood Garden Day",
    "description": "Prepare shared garden beds for winter.",
    "date": "2026-11-15T09:00:00.000Z",
    "location": "Riverside Community Garden",
    "category": "Environment",
    "maxParticipants": 20,
    "image": "https://example.com/garden.jpg"
  }'
```

Required fields are `title`, `description`, a valid future `date`, `location`, and `category`. `maxParticipants` is converted to a number (a missing or invalid value becomes `0`); `image` is optional and defaults to an empty string. The response on success is `201` with a message and `eventId`.

</details>

<details>
<summary><strong>Join an event</strong></summary>

```bash
curl -X POST https://togetherly-server-theta.vercel.app/events/EVENT_ID/join \
  -H 'Authorization: Bearer YOUR_BETTER_AUTH_JWT'
```

The server stores a join record in the `eventJoins` collection with the event ID, a snapshot of event details, the authenticated user's ID and email, and the join time. It also adds the user ID to the event's `participants` array for capacity checks and event details. A unique index prevents duplicate event/user join records. Duplicate joins and events at capacity are rejected with `400`.

</details>

### Common responses

| Status | Meaning |
| --- | --- |
| `200` | Read or mutation succeeded. |
| `201` | Event created. |
| `400` | Invalid required values, past/invalid event date, duplicate join, or no capacity. |
| `401` | Missing, invalid, or expired bearer token on a protected route. |
| `404` | Event not found, or the caller does not own the event being deleted. |
| `409` | A title-date event slug resolves to more than one event. |
| `500` | Database connection or unexpected server error. |

## Event data

Event documents live in the `events` MongoDB collection. A typical document has this shape:

```json
{
  "_id": "MongoDB ObjectId",
  "title": "Neighborhood Garden Day",
  "description": "Prepare shared garden beds for winter.",
  "date": "2026-11-15T09:00:00.000Z",
  "location": "Riverside Community Garden",
  "category": "Environment",
  "maxParticipants": 20,
  "image": "https://example.com/garden.jpg",
  "createdBy": "Better Auth user ID",
  "createdByEmail": "organizer@example.com",
  "participants": ["Better Auth user ID"],
  "createdAt": "2026-10-01T12:00:00.000Z"
}
```

Dates are stored as MongoDB dates. Create and update require a valid future date/time. `createdBy` and `createdByEmail` record the organizer identity, while ownership checks use the stable `createdBy` user ID. `participants` contains user IDs.

Join records live in the `eventJoins` collection. Each record stores `eventId`, `userId`, nested `event` and `user` snapshots, and `joinedAt`. The API creates a unique compound index on `{ eventId, userId }` when it connects to MongoDB. The joined-events endpoint reads these records and also includes memberships already present in legacy event `participants` arrays.

## Authentication

Protected requests use an `Authorization: Bearer <token>` header. The frontend obtains the token through Better Auth's JWT plugin. `auth-middleware.js` retrieves verification keys from the frontend's `/api/auth/jwks` endpoint and validates the JWT issuer and audience against `CLIENT_URL`. Successful verification places the user's `id` and `email` on `req.user`.

The CORS allowlist includes `http://localhost:3000` and the origin derived from `CLIENT_URL`. Requests without an `Origin` header are also accepted for tools such as `curl`. CORS is not authentication; protected routes still require a valid JWT.

## Run locally

### Requirements

- Node.js `24.x`
- npm
- A reachable MongoDB deployment and database
- The Togetherly client running on `http://localhost:3000` if testing browser sign-in and cross-origin calls

```bash
git clone https://github.com/nnasif78/togetherly-server.git
cd togetherly-server
npm install
```

Create a `.env` file in the repository root (see [Environment variables](#environment-variables)), then launch the API:

```bash
npm run dev
```

The API listens on `http://localhost:5000` by default; set `PORT` to choose another local port. Check it at [http://localhost:5000/](http://localhost:5000/). `npm start` runs the same `dev.js` entry point.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Yes | Secret MongoDB connection URI. |
| `DATABASE_NAME` | Yes | Existing Togetherly database name. |
| `CLIENT_URL` | Yes | Exact frontend base URL used as Better Auth JWT issuer/audience and for the `/api/auth/jwks` lookup. Set to `http://localhost:3000` for local development and the deployed frontend URL for production. Match Better Auth's URL format exactly. |
| `PORT` | Local only | Optional local port; defaults to `5000`. Vercel supplies its own request handling. |

Example local `.env`:

```dotenv
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<database>
DATABASE_NAME=togetherly
CLIENT_URL=http://localhost:3000
PORT=5000
```

Keep `.env` out of version control. Configure Vercel variables separately for Production, Preview, or Development as needed. Preview deployments that issue tokens from a different URL need a matching `CLIENT_URL` and accessible JWKS endpoint.

## Deploy to Vercel

Import this backend repository as its own Vercel project. Use the folder containing `package.json` as the **Root Directory** (normally `.`).

| Setting | Value |
| --- | --- |
| Framework preset | Express (or the automatically detected Express preset) |
| Node.js version | `24.x` |
| Install command | Default (`npm install`) |
| Build command | Leave unset; there is no build step. |
| Output directory | Leave unset; Vercel serves the Express function. |

The default export in root `index.js` is the deployed entry point. Vercel sends requests to that Express app, which matches the root paths listed above. There is no `/api` prefix or rewrite. `vercel.json` intentionally contains only the schema declaration.

Set `MONGODB_URI`, `DATABASE_NAME`, and the matching deployed `CLIENT_URL` in Vercel Project Settings → Environment Variables. The database's network rules must allow connections from the Vercel runtime. Vercel outbound IPs may not be fixed unless the project has a static egress option.

## Project files

```text
index.js            # Express app, MongoDB connection, and event routes
auth-middleware.js  # Better Auth JWT verification via remote JWKS
dev.js              # Local app.listen() entry point
vercel.json         # Minimal Vercel project configuration
```

## Troubleshooting

<details>
<summary><strong>Protected route returns 401</strong></summary>

Confirm that the request includes a current Better Auth JWT as `Authorization: Bearer ...`. Check that `CLIENT_URL` matches the token's issuer and audience and that `${CLIENT_URL}/api/auth/jwks` is reachable from the deployed API.

</details>

<details>
<summary><strong>Browser reports a CORS error</strong></summary>

Make sure the browser's exact origin is `http://localhost:3000` or matches the origin of `CLIENT_URL`. The frontend should call the API directly at its configured `NEXT_PUBLIC_API_URL`.

</details>

<details>
<summary><strong>API returns a database connection error</strong></summary>

Check the MongoDB URI, database availability, and network access rules for the Vercel runtime. The root health check can respond while the database is unavailable; event routes need MongoDB.

</details>

## Contributing

Issues and pull requests are welcome. Include the route or behavior affected and a clear request/response example for API changes. Never include credentials, JWTs, or private user data in issues or commits.

## License

No license file is currently included. Contact the repository owner before reusing this project beyond the permissions provided by GitHub's default terms.
