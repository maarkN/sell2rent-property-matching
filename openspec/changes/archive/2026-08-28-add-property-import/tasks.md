## 1. Schema

- [x] 1.1 Migration 001: `properties` with a unique external identifier, the check constraints from design.md Decision 1, and the indexes from Decision 5, and verify the applied table lists every constraint and index
- [x] 1.2 Add the migration runner, and verify running it twice is a no-op rather than an error

## 2. Domain

- [x] 2.1 Implement `Result`, and verify unit tests cover both branches
- [x] 2.2 Implement the property entity's validating factory, and verify one unit test per malformed shape in the feed asserts a distinct rejection reason — ten in total, with no database
- [x] 2.3 Declare the property repository contract and its token in the domain, and verify the domain layer still imports nothing from other layers

## 3. Persistence

- [x] 3.1 Implement the row schema that parses stored properties, and verify a test asserts a fixed-point column arriving as text becomes a number
- [x] 3.2 Implement the batch insert ignoring conflicts on the external identifier, returning the inserted count, and verify an integration test importing the same batch twice leaves the row count unchanged

## 4. Use case and endpoint

- [x] 4.1 Implement the import use case accumulating rejections, and verify a unit test with a malformed record positioned first still persists every later valid record
- [x] 4.2 Add the positional fallback for rejections lacking an identifier, and verify the three identifier-less feed records report their position with an empty identifier
- [x] 4.3 Wire `POST /properties/import`, and verify importing the provided feed reports **410 imported and 10 skipped** with one reason per rejection

## 5. Tests

- [x] 5.1 Verify the unit tier runs without a database and covers every rejection scenario in the spec
- [x] 5.2 Verify the integration tier proves idempotency and that a constraint refuses a non-positive price written directly
