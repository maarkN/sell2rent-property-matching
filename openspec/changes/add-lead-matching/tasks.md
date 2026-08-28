## 1. Scoring query

- [ ] 1.1 Implement the weighted scoring terms over every stored property, and verify against a seeded database that a property satisfying all four criteria scores 95 before the bonus and one satisfying none scores 0
- [ ] 1.2 Add the proximity bonus with all three guards from design.md Decision 2, and verify 5 at the midpoint, 0 at both boundaries, 0 for a 5,000,000 property, and a fractional value at quarter-distance
- [ ] 1.3 Add ordering with the identifier tie-break and no rounding inside the query, and verify two properties differing beyond the reported precision rank in full-precision order
- [ ] 1.4 Add pagination with the total obtained by a window function, and verify a single round trip returns both the page and the total

## 2. Use case and endpoint

- [ ] 2.1 Implement the matching use case asserting the investor exists, and verify an unknown identifier returns `404` without running the ranking
- [ ] 2.2 Define the pagination query schema with coercion, defaults, and a bounded page size, and verify a page below one and a size above the maximum both return `400`
- [ ] 2.3 Wire `GET /investors/:id/matches`, and verify it returns all 410 stored properties ranked, rounding the score only in the response

## 3. Tests (integration, real PostgreSQL)

- [ ] 3.1 Verify the maximum score case: city, price range, bedrooms and area all satisfied at the range midpoint
- [ ] 3.2 Verify a partial match scoring city only
- [ ] 3.3 Verify a degenerate range where minimum equals maximum yields 30 plus the full bonus and does not error
- [ ] 3.4 Verify no score is negative and none exceeds 100 across the whole seeded inventory
- [ ] 3.5 Verify the tie-break orders equal scores by identifier ascending
- [ ] 3.6 Verify paginating the full result set returns every property exactly once with no repeats between consecutive pages
- [ ] 3.7 Verify an investor whose preferred city holds no inventory still receives a ranked list rather than an empty one
