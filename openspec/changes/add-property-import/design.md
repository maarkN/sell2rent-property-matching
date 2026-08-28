## Context

See `proposal.md` — Why. This section records what was measured about the feed,
because the numbers contradict the brief in two places.

**The dataset is a designed fixture.** Its 420 records fall into three blocks:

| Block | Count | Nature |
|---|---|---|
| First 400 | 400 | Clean, realistic, randomised across 8 cities in TX and FL |
| Next 10 | 10 | **Valid but extreme** — prices of 50,000 / 2,500,000 / 5,000,000; 400 and 6,000 sq ft; 1 and 8 bedrooms |
| Final 10 | 10 | Malformed, one distinct failure mode each |

The middle block must import. Those records exist to skew per-city averages and
to break unguarded arithmetic in the matching engine.

**Two contradictions with the brief:**

1. The brief's example response shows `imported: 405, skipped: 15`. The actual
   counts are **410 imported and 10 skipped**. The example is illustrative;
   tuning a validator to reproduce it would mean building the wrong thing.
2. The brief's rejection entry is `{ external_id, reason }`, but three malformed
   records carry no usable `external_id`. The shape must tolerate its absence.

## Goals / Non-Goals

**Goals:**

- Make a malformed record a reported outcome, never a failed batch.
- Make repeated imports safe by construction rather than by checking first.
- Make invalid data unrepresentable in storage, not merely rejected in code.

**Non-Goals:**

- Reconciling changed listings; import is insert-only.
- Streaming ingestion. The feed is ~77 KB.

## Decisions

### 1. Constraints in the schema mirror the validation rules

Scoring-relevant columns are `NOT NULL`, with `CHECK` constraints restating the
feed rules: price greater than zero, non-negative counts, positive areas.

**Three-valued logic is the reason nullability is refused.** In the matching
query, `NULL >= 3` evaluates to `NULL`, not `false`, and `40 + NULL` is `NULL`.
A single property with a null bedroom count would erase that row's entire score
rather than cost it 15 points. Every malformed record in the feed is already
missing these columns, so requiring them costs no valid data.

The constraints are also defence in depth: application validation rejects a
negative price, and the constraint guarantees no other write path introduces one.

*Alternative considered:* nullable columns with `COALESCE` in the scoring
expression. Rejected: it pushes a data-quality concern into every future query.

### 2. Idempotency via a single conflict-ignoring insert

Valid records are inserted in one statement per batch, ignoring conflicts on the
external identifier. The unique constraint is the mechanism, not merely a
guarantee.

*Alternatives considered:* selecting existing identifiers and filtering in
application code (rejected: a race, and an extra round trip); an upsert that
updates on conflict (rejected: the brief asks for duplicate prevention, not feed
reconciliation).

### 3. Validation is per-record and accumulating, never fail-fast

Each record is validated independently. A rejection records a reason and
processing continues, so one malformed record cannot abort the batch.

Validation lives in the entity's factory rather than in the service: the rules
are business rules, and putting them in the entity makes them unit-testable
without a database.

### 4. Rejections identify records positionally

Every rejection carries the record's index in the source feed in addition to its
external identifier, and the identifier is nullable in the response.

This extends the brief's shape rather than replacing it — entries that have an
identifier still look exactly as specified — and it is the only way to report
the three records that have none.

### 5. Indexes are justified by scale, and one of them serves nothing yet

| Index | Justification |
|---|---|
| Unique on the external identifier | Load-bearing: it is what makes the conflict-ignoring insert work, and what enforces idempotency |
| On city | Serves the analytics aggregation added by a later change; a covering index on city and price permits an index-only scan for the per-city average at scale |

**No index can serve the matching query** added by `add-lead-matching`: it
evaluates an expression over every row and orders by a computed column, so it is
a full scan followed by a sort by construction. At this row count the planner
will scan sequentially regardless, so these indexes express intent at a scale the
dataset does not reach.

## Risks / Trade-offs

- **`NOT NULL` on every scoring column rejects partially-complete listings.** A
  real feed would contain valid but incomplete records. → None exists in this
  dataset; the fix would be a nullable column plus explicit `COALESCE` in the
  scoring expression, which is contained.
- **Reading the whole feed into memory to validate it.** → ~77 KB. Streaming is
  a non-goal; see `add-import-resilience`.
- **Insert-only import cannot reflect a changed listing.** → Accepted and
  documented; reconciliation is separate work.

## Migration Plan

1. Migration 001 — `properties` with its unique and check constraints, then its
   indexes.
2. Import is run explicitly through the endpoint; no migration seeds data.

Rollback is dropping the table. Because import is idempotent, re-running it
after a rollback restores an identical state.
