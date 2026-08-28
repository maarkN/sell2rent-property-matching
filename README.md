# Property Lead Matching Engine

A backend service that ingests an MLS property feed, captures investor buying criteria, and ranks the stored inventory against those criteria — with the scoring computed in PostgreSQL rather than in application memory.

Built for the Sell2Rent technical challenge. The original brief is preserved verbatim in [`CHALLENGE.md`](CHALLENGE.md); the submission notes are in [`SUBMISSION.md`](SUBMISSION.md) and the AI usage disclosure in [`ai.md`](ai.md).

**Stack:** NestJS 10 (Express adapter) · TypeScript 5 in strict mode · PostgreSQL 16 · `node-postgres` with hand-written SQL · Zod · winston. No ORM.

---

## Quick start

Requires Node 20+ and Docker.

```bash
cp .env.example .env
docker compose up -d      # PostgreSQL 16, healthchecked
npm install
npm run migrate           # applies src/infrastructure/database/migrations/*.sql
npm run start:dev         # http://localhost:3000
```

Then load the feed and try a match:

```bash
curl -X POST http://localhost:3000/properties/import

curl -X POST http://localhost:3000/investors \
  -H 'Content-Type: application/json' \
  -d '{"name":"Jane Doe","min_price":150000,"max_price":300000,
       "preferred_city":"Houston","min_bedrooms":3,"min_square_feet":1200}'

curl 'http://localhost:3000/investors/1/matches?page=1&limit=20'
curl http://localhost:3000/analytics/top-cities
```

---

## Environment variables

Every name below must exist in `src/shared/config/env.schema.ts`. The environment is parsed by a Zod schema at boot, so a missing or malformed value is a refused startup that names the problem — never an `undefined` surfacing on some later request.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | — (**required**) | PostgreSQL connection string. Must start with `postgres`. |
| `DB_PORT` | `5432` | Host port for the Docker database. Read by `docker-compose.yml`, not by the service. |
| `PORT` | `3000` | HTTP port. |
| `NODE_ENV` | `development` | One of `development`, `test`, `production`. |
| `LOG_LEVEL` | `info` | One of `error`, `warn`, `info`, `debug`. |
| `PROPERTIES_FEED_PATH` | `./data/properties.json` | The feed the import endpoint reads. Configurable so tests can point at a fixture. |

**If port 5432 is already taken on your machine**, set `DB_PORT` to something free and update the port in `DATABASE_URL` to match. This is the one setup step that bites: see the note under [running the tests](#running-the-tests).

---

## Running the tests

```bash
npm test              # unit, then integration
npm run test:unit     # 41 tests, no database
npm run test:integration   # 61 tests, real PostgreSQL
npm run typecheck
```

Integration tests run against **real PostgreSQL, never a substitute dialect** — everything risky in this project is Postgres-specific: the clamped bonus, the integer-division trap, and `ORDER BY` resolving a bare name against an output alias. A different engine would reproduce none of them.

They also run **serially**. Integration suites share one database and truncate the tables they assert on, so parallel workers would read each other's half-finished state. Jest has no per-project `maxWorkers`, so the serialisation lives in the `test:integration` script as `--runInBand`. Unit tests stay parallel.

> **If you changed `DB_PORT`**, export `DATABASE_URL` when running the tests. `tests/integration/global-setup.ts` falls back to `localhost:5432`, which on a machine that already has a PostgreSQL there produces a confusing authentication error rather than a connection refusal:
>
> ```bash
> DATABASE_URL='postgresql://postgres:postgres@localhost:5433/sell2rent' npm test
> ```

---

## API

### `POST /properties/import`

Reads the feed, inserts valid properties, and reports every rejection with a reason. Idempotent: a repeated call inserts nothing. Responds `200`, not `201` — "Created" would be a lie on every run after the first.

```json
{ "imported": 410, "skipped": 10,
  "errors": [ { "external_id": "P0416", "index": 415, "reason": "price is negative" } ] }
```

Three records in the feed carry no usable identifier, so `external_id` is nullable in a rejection and `index` is what keeps those traceable rather than unreportable.

### `POST /investors` · `GET /investors/:id`

Creates and retrieves an investor with their buying criteria. `400` on invalid input naming the rejected field, `404` for an unknown id, `201` on creation.

### `GET /investors/:id/matches?page=1&limit=20`

Ranks **every** stored property for the investor, best fit first.

```json
{ "data": [ { "external_id": "P0174", "city": "Houston", "state": "TX", "price": 229704,
              "bedrooms": 3, "bathrooms": 2, "square_feet": 1677, "lot_size": 8026,
              "score": 99.6864 } ],
  "meta": { "page": 1, "page_size": 20, "total": 410 } }
```

`limit` is the parameter the brief documents; `page_size` is accepted as a synonym. Defaults: page 1, size 20, maximum 100. A page past the end returns `200` with an empty `data` and the total intact.

### `GET /analytics/top-cities`

A bare JSON array, cities ranked by property count.

```json
[ { "city": "Fort Worth", "property_count": 54, "avg_price": 293296.06, "total_inventory": 54 } ]
```

### Errors

One shape everywhere, emitted by a single global filter — including for failures that never reach a handler, such as an unknown route:

```json
{ "statusCode": 404, "error": "Not Found", "message": "Investor with id 99 not found" }
```

Success responses carry **no envelope**. `GET /investors/:id/matches` is the only endpoint with a shape of its own, because it is the only one the brief leaves unspecified and pagination has to report a total somewhere.

---

## Architecture

Layer-first clean architecture. Every arrow points inward, toward the domain.

```
src/
  main.ts                  bootstrap only
  app.module.ts            composition root — the ONLY file binding a contract to an implementation
  domain/                  entities, repository interfaces + DI tokens, Result type
  application/usecases/    orchestration
  infrastructure/          pool, versioned .sql migrations, repositories, row schemas
  interfaces/              controllers, Zod DTOs, the single error filter, validation pipe
  shared/                  env schema + typed config, logger
tests/unit  tests/integration    mirror src/
```

- **`domain/` imports nothing from other layers** — no NestJS, no `pg`, no Zod. A unit test enforces this rather than a README promise.
- **`application/` depends on domain interfaces only**, never on a repository implementation. Also enforced by that test.
- **DI tokens are Symbols declared in the domain**, beside the interface they name, because TypeScript interfaces are erased at runtime. A duplicate string token would silently overwrite an earlier binding instead of failing.
- **Zod sits at both trust boundaries** — HTTP input *and* database rows. `pool.query<T>()` is an unchecked assertion, not a verification: rename a column and `strict: true` catches nothing, while `NUMERIC` and `BIGINT` arrive as strings.

---

## Key design decisions

Fuller reasoning, with the measurements behind each, is in [`SUBMISSION.md`](SUBMISSION.md). Every change also carries its own design record under `openspec/changes/archive/`.

**Matching ranks the whole inventory; it never filters it.** The brief gives a scoring table and an ordering but never says who enters the list. A hard filter on city and price would make 70 of the 100 points constant across every returned row, and would hand an empty list to an investor whose price band falls in a gap — one city holds 54 properties but nothing between 800,000 and 2,000,000. Criteria are ranking weights; a property failing all of them still appears, last.

**Every scoring-relevant column is `NOT NULL`, and optional investor minimums default to `0`.** The score is a sum, and `NULL` anywhere in it erases the row's *entire* score rather than costing it points. `preferred_city` is the one exception, because "no preference" genuinely differs from any particular city — and the query is written so that a NULL comparison falls through to zero rather than poisoning the total.

**Ordering happens at full precision; rounding happens at the HTTP edge.** Rounding a score in the SQL projection makes `ORDER BY score` sort by the *rounded* value, because a bare ordering name resolves against output aliases before input columns. On this dataset that puts the worst of three near-tied properties at the top of the list — silently, with a plausible-looking result.

**One index, and an explicit statement that the other query cannot have one.** `properties (city, price)` serves the analytics aggregation. The matching query evaluates an expression over every row and orders by a computed column — a full scan and a sort, by construction. The path to scaling it is a materialised score or a pre-filter, not an index.

---

## Spec-driven history

This service was built as five OpenSpec changes, each with a proposal, a delta specification, a design record and a task list written before its code. All are archived under `openspec/changes/archive/`, and the resulting specifications — five capabilities, twenty-four requirements — live in `openspec/specs/`.

Three further changes exist as **proposals only** and were deliberately not implemented: `add-import-resilience`, `add-match-score-threshold` and `add-observability`. Recording an idea and scoping it out is a decision worth leaving visible.

All of it is plain Markdown and reads without tooling:

```
openspec/specs/                    the specifications in force
openspec/changes/archive/          each change: proposal, delta spec, design, tasks
openspec/changes/<name>/           the three proposals that were never implemented
```

The OpenSpec CLI is not a dependency of this project. If you happen to have it installed, `openspec view` renders the same thing as a dashboard.
