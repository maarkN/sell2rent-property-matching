## 1. Aggregation query

- [x] 1.1 Implement the per-city aggregation returning count, average price, and total inventory, ordered by count descending, and verify one row per city is transferred
- [x] 1.2 Convert the fixed-point average to a number at the documented precision, and verify it does not serialise as text

## 2. Endpoint

- [x] 2.1 Wire `GET /analytics/top-cities`, and verify the body is a bare JSON array with no wrapping object
- [x] 2.2 Verify `total_inventory` equals each entry's property count, per design.md Decision 1

## 3. Tests (integration, real PostgreSQL)

- [x] 3.1 Verify city counts sum to the number of stored properties, so rejected feed records contribute nothing
- [x] 3.2 Verify a city holding one property reports a count of one and an average equal to that property's price
- [x] 3.3 Verify an empty database returns an empty array with `200` rather than an error
- [x] 3.4 Verify a city containing the planted outliers reports an average reflecting them
