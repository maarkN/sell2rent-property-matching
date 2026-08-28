# Submission

## Repository URL

https://github.com/maarkN/sell2rent-property-matching

---

## Setup Notes

Full instructions, the environment-variable table and the API reference are in [`README.md`](README.md). The original brief is preserved verbatim in [`CHALLENGE.md`](CHALLENGE.md). The short version:

```bash
cp .env.example .env
docker compose up -d      # PostgreSQL 16
npm install
npm run migrate
npm run start:dev
```

Two things are worth knowing before running it:

**The database listens on 5433, not 5432.** `DB_PORT` in `.env` moves the host port so the stack does not collide with a PostgreSQL already running on the machine. `DATABASE_URL` already reflects it.

**The integration tests need `DATABASE_URL` in the environment.** `tests/integration/global-setup.ts` falls back to `localhost:5432` when the variable is absent, which on a machine with another Postgres running produces a confusing authentication error rather than a connection refusal. Run them as:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:5433/sell2rent' npm test
```

Loading `.env` inside the global setup would remove the footgun; it is listed under improvements rather than done, because it is a change to the test harness and not to the service.

`npm test` runs unit tests in parallel and integration tests serially. The serialisation is deliberate: integration suites share one database and truncate the tables they assert on, so parallel workers would read each other's half-finished state. Jest has no per-project `maxWorkers`, so it lives in the npm script as `--runInBand`.

---

## Design Decisions

### 1. Matching ranks the entire inventory; it never filters it

The brief specifies a scoring table and an ordering, but never says who enters the list. Every stored property receives a score and is returned in rank order — nothing is excluded. Three measurements against the provided dataset drove this:

- **A hard filter would make 70 of the 100 points constant.** If city and price range were requirements, every returned row carries 40 + 30 by construction, collapsing the useful scale to the remaining 30. Points are not awarded for criteria that were already mandatory.
- **The tie-breaking rule presupposes a large result set.** Under ranking, the largest group of properties sharing a score is 131. Under a hard filter, the entire result set is 24 rows — measured, not guessed.
- **A hard filter returns empty lists to reasonable investors.** One city holds 54 properties but nothing at all between 800,000 and 2,000,000: real listings stop near 568,000 and the planted outliers resume at 2,500,000. A ranked list degrades gracefully and surfaces the closest available alternatives, which is the point of a matching engine.

The alternative reading is preserved as an unimplemented proposal (`add-match-score-threshold`) rather than discarded.

### 2. The scoring SQL, and the four things in it that carry weight

Scoring, ordering and pagination happen in one statement. Only the requested page reaches the application. Four details are load-bearing, and each corresponds to a real record or input in the dataset:

**`city = $1` with a NULL parameter yields NULL, not false**, so the `CASE` falls to `ELSE 0`. This is also why every scoring-relevant column is `NOT NULL` in the schema and why the optional investor minimums default to `0` rather than staying nullable: the score is a sum, and one NULL anywhere in it erases the row's _entire_ score instead of costing it points.

**Every literal in the bonus is cast to `numeric` before dividing.** With integer operands the division truncates, the bonus degenerates to 0 or 5 and never takes an intermediate value — and the query keeps returning plausible-looking scores while doing it. A test asserting 97.5 at quarter-distance is what catches it.

**A zero-width range branch**, or an investor whose minimum equals their maximum divides by zero. **A clamp to [0, 5]**, or the 5,000,000 property scores −288.3 against a 150,000–300,000 range and corrupts the ordering rather than merely trailing.

**Ordering happens at full precision; rounding happens at the HTTP edge.** Writing the obvious thing — selecting a rounded score under the alias `score` and then ordering by `score` — silently sorts by the _rounded_ value, because a bare ordering name resolves against output aliases before input columns. Reproduced on the dataset: P0187 (59.38333), P0363 (59.38193) and P0029 (59.37886) all round to 59.38, and the aliased form returns them P0029-first — the worst fit of the three at the top of the list. The failure is silent and produces a plausible result, which is what makes it worth a test.

### 3. Indexing: one index, and an explicit statement that the other query cannot have one

`properties (city, price)` serves the analytics aggregation, and including `price` makes an index-only scan possible for the per-city average at scale.

The matching query gets nothing, and this is stated rather than hidden. It evaluates a `CASE` expression over every row and orders by a computed column: a full scan followed by a sort, by construction. At 410 rows the planner would scan sequentially regardless. The path to scaling it is a materialised score or a pre-filter, not an index — adding one here would be decoration.

### 4. Responses are bare, with exactly one shaped exception

`POST /properties/import` and `GET /analytics/top-cities` return the shapes the brief specifies, unwrapped. No `{ statusCode, message, metadata, data }` envelope is applied anywhere — the analytics contract is a JSON array, which no envelope can express.

`GET /investors/:id/matches` is the one endpoint whose shape the brief does not specify, and pagination has to report a total somewhere, so it returns `{ data, meta: { page, page_size, total } }`. That is the endpoint's own contract, not a wrapper imposed across the API.

The total is attached to the page with `LEFT JOIN LATERAL ... ON TRUE` rather than a `COUNT(*) OVER ()` window function. A window function is evaluated per returned row, so a page past the end returns no rows and therefore no total — the field would read 0 exactly when the caller most needs it to say how far they overshot. The lateral join always yields at least one row, in a single round trip.

---

## What I Would Improve With More Time

**Cursor-based pagination.** `LIMIT/OFFSET` degrades linearly: the database still produces and discards every row before the offset, so page 500 costs what page 1 costs plus everything before it. At 410 rows this is invisible; at a real MLS feed it is the first thing to hurt. A keyset cursor over `(score, external_id)` — the pair the ordering is already total on — would make every page cost the same. The ordering was deliberately made total partly so this remains a drop-in change rather than a redesign.

**A consistent request and response envelope.** The bare shapes here were dictated by the brief, and matching them exactly was the right call for a challenge. For a real service I would define one envelope and apply it uniformly behind a version prefix (`/v1`), so that pagination metadata, error detail and success payloads have one shape a client can code against — instead of the current situation where one endpoint carries `meta` and the others carry nothing, which is coherent only because it is documented.

**Ideas worth taking from `ack-nestjs-boilerplate`**, which solves several of these in production and which I looked at while choosing the architecture here:

- **Cursor-supporting pagination as a first-class service** rather than per-endpoint query parsing — the same reasoning as above, but shared.
- **Standardised responses with i18n**, so the error contract carries a message _code_ the client can switch on rather than an English sentence. The current `{ statusCode, error, message }` is consistent but not localisable.
- **URL-based API versioning**, which is what makes changing a response shape possible at all once something depends on it.
- **A repository abstraction over the data layer.** This project already has one, and I would keep it — it is what let the whole matching engine be exercised through an in-memory fake in unit tests while the real ranking runs against Postgres in integration tests.
- **Health check endpoints and structured observability** (Sentry, request-scoped logging with correlation IDs). This is deferred here as an explicit proposal (`add-observability`) rather than forgotten — the service logs with winston but has no readiness endpoint and no request tracing.
- **Activity/audit logging.** For a service that decides which properties an investor is shown, being able to answer "what did we rank for this investor on this date, and under which criteria" is a product requirement, not a nicety.

**Resilience on import.** The feed is read from disk in one shot and inserted in one statement. A real MLS feed arrives over the network, can be partially available, and can be large enough to stream. Deferred as `add-import-resilience`.

**Swagger/OpenAPI.** Listed as bonus, not done. With the DTOs already defined as Zod schemas, generating the document from them rather than hand-maintaining decorators would be the approach.

**`.env` loading in the test global setup**, so `npm test` works without exporting `DATABASE_URL` by hand.

---

## Known Limitations

**Analytics city ordering is partial, not total.** The brief specifies ranking cities by property count, and that is what the query does. The dataset contains two ties — Fort Worth and Austin at 54, Dallas and Tampa at 50 — so the relative position within each tied pair is whatever the query plan emits and must not be relied upon. Adding `city ASC` is the one-line remedy; it is left out because the brief specifies ranking by count and nothing else. The tests assert only that counts are non-increasing, so the suite does not encode an order the query does not promise.

**`total_inventory` duplicates `property_count`.** The brief names the field but never defines it, and its own example prints both with the same value. Read as a count of listings rather than their summed value, on the grounds that two fields agreeing is a structural fact rather than a rounded figure, and that in real-estate usage "inventory" denotes how many homes are available. The redundancy is preserved deliberately so the response matches the specified shape.

**No fixed score precision fully separates the ranking.** Scores are reported at 4 decimals. Measured across four investor profiles, 2 decimals collapse distinct scores in every one of them — up to 41 of 190 — and 4 collapse at most one pair. But price is continuous within the range, so two properties can always sit arbitrarily close to the midpoint: one profile already produces a pair 0.000025 apart. Rounding is a display concern with an irreducible residual. The ordering never sees the rounded number.

**The proximity bonus formula is invented.** The brief specifies "0–5 points, closer to the range midpoint = more points" and nothing else. A clamped linear distance from the midpoint is one reasonable curve; its boundary behaviour and all three of its guards are documented and tested, so the reasoning is auditable even if a reviewer imagined a different shape.

**Ranking the whole inventory returns implausible rows.** A 5,000,000 property appears in the results for an investor capped at 300,000 — last, and never displacing a genuine candidate, but present. Accepted as the cost of ranking over filtering.

**No authentication, authorisation or rate limiting.** Out of scope for the brief and not attempted.

**Bonus items not implemented:** Swagger/OpenAPI, `GET /investors`, `GET /analytics/investor-match-rate`. The last one would need a definition of "matches" — a threshold — which this project deliberately does not adopt; it is recorded as the `add-match-score-threshold` proposal.

**Two contract deviations existed and were fixed late.** `?page=1&limit=20` — the brief's own example — returned 400 until the query schema was corrected to accept `limit`, and `/analytics/top-cities` returned `average_price` rather than `avg_price`. Both were found by re-reading the brief against a running instance while writing this document, not by the test suite, which was green throughout. Both are now covered by tests using the brief's spelling.

---

## Approximate Time Spent

Generated by AI against my commits and harness memory, but fixed by me

| Area                                                                                   | Time    |
| -------------------------------------------------------------------------------------- | ------- |
| Learning OpenSpec and getting the project's specs right and testing how the spec works | 3h      |
| Expanding the idea and choosing the architecture (nearly over-engineered it)           | 1h      |
| Schema design, migrations and constraints                                              | 1h      |
| Service foundation — config, error contract, validation, DI, logging                   | 0.5h    |
| Property import and dirty-data handling                                                | 0.5h    |
| Investor profiles                                                                      | 0.5h    |
| Matching engine — scoring SQL, guards, ordering, pagination                            | 0.5h    |
| Analytics                                                                              | 0.5h    |
| Fixing the API contract deviations against the brief                                   | 0.5h    |
| Documentation — design records, README, `ai.md`, this file                             | 0.5h    |
| **Total**                                                                              | **~8h** |

The two largest line items are the honest ones. The matching engine took longest not because the scoring is complicated — it is a weighted sum — but because nearly every way of writing it in SQL is subtly wrong: truncating integer division, a negative unclamped bonus, a division by zero on a degenerate range, and an `ORDER BY` that silently sorts by a rounded alias. Each failure produces a plausible-looking list. Finding them cost more than writing the query.
