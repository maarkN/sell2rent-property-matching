## 1. Schema

- [ ] 1.1 Migration 002: `investors` with its check constraints including the price-range invariant, and verify an inverted range is refused at the database level

## 2. Domain

- [ ] 2.1 Implement the investor entity with its criteria invariants, and verify a unit test rejects an inverted price range
- [ ] 2.2 Declare the investor repository contract and its token, and verify the domain layer imports nothing from other layers

## 3. Persistence

- [ ] 3.1 Implement insert and lookup by identifier with row-schema parsing, and verify an integration test round-trips a profile both with and without a preferred city

## 4. Endpoints

- [ ] 4.1 Define the creation schema and its derived type, and verify each invalid-input scenario in the spec returns `400`
- [ ] 4.2 Wire `POST /investors`, and verify a valid submission returns `201` with the assigned identifier and that a rejected submission stores nothing
- [ ] 4.3 Wire `GET /investors/:id`, and verify a stored investor returns `200` with every criterion, an unknown identifier returns `404` naming it, and a malformed identifier returns `400`

## 5. Tests

- [ ] 5.1 Verify unset optional criteria default rather than persist as null, so the matching query's comparisons stay total
