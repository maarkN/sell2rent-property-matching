## 1. Scoring query

- [x] 1.1 Implement the weighted scoring terms over every stored property, and verify against a seeded database that a property satisfying all four criteria scores 95 before the bonus and one satisfying none scores 0
- [x] 1.2 Add the proximity bonus with all three guards from design.md Decision 2, and verify 5 at the midpoint, 0 at both boundaries, 0 for a 5,000,000 property, and a fractional value at quarter-distance
- [x] 1.3 Add ordering with the identifier tie-break and no rounding inside the query, and verify against the reproduced case in design.md Decision 3 that P0187, P0363 and P0029 rank in that order for the brief's sample investor, rather than the identifier order the aliased form produces
- [x] 1.4 Add pagination with the total attached per design.md Decision 4, and verify a single round trip returns both the page and the total, and that a page past the end still carries the full total rather than zero

## 2. Use case and endpoint

- [x] 2.1 Implement the matching use case asserting the investor exists, and verify an unknown identifier returns `404` without running the ranking
- [x] 2.2 Define the pagination query schema with coercion and the bounds from design.md Decision 6 (`page` default 1, `page_size` default 20, maximum 100), and verify a page below one and a size above the maximum both return `400`, and that omitting both yields page 1 at size 20
- [x] 2.3 Wire `GET /investors/:id/matches` returning the `{ data, meta }` shape of design.md Decision 7, and verify it ranks all 410 stored properties, rounding the score to 4 decimals only in the response

## 3. Tests (integration, real PostgreSQL)

- [x] 3.1 Verify the maximum score case: city, price range, bedrooms and area all satisfied at the range midpoint
- [x] 3.2 Verify a partial match scoring city only
- [x] 3.3 Verify a degenerate range where minimum equals maximum yields 30 plus the full bonus and does not error
- [x] 3.4 Verify no score is negative and none exceeds 100 across the whole seeded inventory
- [x] 3.5 Verify the tie-break orders equal scores by identifier ascending
- [x] 3.6 Verify paginating the full result set returns every property exactly once with no repeats between consecutive pages
- [x] 3.7 Verify an investor whose preferred city holds no inventory still receives a ranked list rather than an empty one
- [x] 3.8 Verify a page beyond the last returns `200` with an empty page and a total still equal to the full inventory
- [x] 3.9 Verify an investor with no preferred city receives a ranked list in which no property took the city weight and no score was erased by the null
- [x] 3.10 Verify the inclusive boundaries all count as satisfied: bedrooms equal to the minimum, square footage equal to the minimum, and price equal to the maximum
