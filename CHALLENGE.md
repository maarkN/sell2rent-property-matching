# Sell2Rent Technical Challenge
## Property Lead Matching Engine

Hi there,

Thank you for moving forward in our process.

This challenge simulates a real problem we solve at Sell2Rent: matching real estate inventory against investor buying criteria in an efficient and scalable way.

You have **up to 72 hours** to complete this challenge.

---

## Objective

Build a backend service that:

1. Imports property data from a provided dataset
2. Allows creation of investors with buying criteria
3. Matches properties to investors using a scoring system
4. Exposes RESTful endpoints to retrieve matches and analytics

---

## Technical Requirements

- Node.js
- TypeScript (required — no implicit `any`)
- Express or NestJS
- PostgreSQL
- REST API

---

## Provided Dataset

Inside the `/data` folder:

```
data/properties.json
```

This file simulates an MLS feed and contains approximately 420 property records.

Each record follows this structure:

```json
{
  "external_id": "P1001",
  "city": "Houston",
  "state": "TX",
  "price": 210000,
  "bedrooms": 3,
  "bathrooms": 2,
  "square_feet": 1650,
  "lot_size": 5000
}
```

> **Important:** The dataset intentionally includes malformed records — null values, wrong data types, negative prices, and missing fields. Your import endpoint must handle these gracefully without crashing. Skipping an invalid record with a logged reason is acceptable; silently discarding records or crashing is not.

---

## Endpoints to Implement

### 1. Property Import

```
POST /properties/import
```

Requirements:

- Read the provided JSON dataset
- Persist valid properties into PostgreSQL
- Use `external_id` as a unique constraint — prevent duplicate inserts on repeated calls
- Skip malformed records and include them in the response with a reason
- Add appropriate database indexes

Expected response shape:

```json
{
  "imported": 405,
  "skipped": 15,
  "errors": [
    { "external_id": "P0416", "reason": "negative price" },
    { "external_id": "P0412", "reason": "price is not a number" }
  ]
}
```

---

### 2. Investor Creation

```
POST /investors
```

Request body:

```json
{
  "name": "Jane Doe",
  "min_price": 150000,
  "max_price": 300000,
  "preferred_city": "Houston",
  "min_bedrooms": 3,
  "min_square_feet": 1200
}
```

Requirements:

- Validate all inputs — return `400` for invalid data
- Store investor preferences in PostgreSQL
- Design a relational schema with appropriate constraints

---

### 3. Investor Lookup

```
GET /investors/:id
```

- Return the investor profile and their buying criteria
- Return `404` if the investor does not exist

---

### 4. Matching Engine

```
GET /investors/:id/matches
```

Scoring rules:

| Criterion | Points |
|---|---|
| City matches `preferred_city` | 40 |
| Price within `[min_price, max_price]` | 30 |
| Bedrooms ≥ `min_bedrooms` | 15 |
| Square footage ≥ `min_square_feet` | 10 |
| Price proximity bonus (closer to range midpoint = more points) | 0–5 |

Requirements:

- Results sorted by score descending
- Properties with equal scores sorted by `external_id` ascending
- Pagination via `?page=1&limit=20`
- Scoring must be computed in SQL — do not load all properties into memory
- Return `404` if the investor does not exist

---

### 5. Analytics

```
GET /analytics/top-cities
```

Return cities ranked by property count, with average price and total inventory per city. Use SQL aggregation — do not compute this in application code.

Expected response shape:

```json
[
  {
    "city": "Austin",
    "property_count": 55,
    "avg_price": 285430,
    "total_inventory": 55
  }
]
```

---

## Error Responses

Use a consistent error shape across all endpoints:

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Investor with id 99 not found"
}
```

---

## What We Evaluate

- TypeScript strictness (no `any`, proper interfaces)
- Code structure and separation of concerns
- Database schema design and indexing decisions
- Error handling — especially around the dirty dataset
- Query efficiency (SQL-level scoring, not in-memory)
- API design (RESTful conventions, HTTP status codes, consistent response shape)
- Documentation quality

---

## Bonus (optional)

Not required. Noted positively if present:

- Docker Compose setup
- Swagger / OpenAPI documentation
- Unit or integration tests
- `GET /investors` — list all investors
- `GET /analytics/investor-match-rate` — percentage of properties that match at least one investor

---

## Deliverables

1. A GitHub repository (public or with shared access granted to `a.pacheco@sell2rent.com`)
2. A `README.md` with setup instructions, environment variables, how to run locally, and key design decisions
3. A completed `ai.md` following the template in `ai-example.md`
4. A completed `SUBMISSION.md`

---

## Environment

Copy `.env.example` to `.env` and fill in your values before running:

```bash
cp .env.example .env
```

---

## Questions

If you have any questions during the challenge, reach out to **Aníbal Pacheco** at **a.pacheco@sell2rent.com**.

We value clarity, thoughtful design, and pragmatic decisions over perfection.

— Sell2Rent Engineering Team
