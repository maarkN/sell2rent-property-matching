## Context

See `proposal.md` — Why. The error shape, the validation mechanism, and the
configuration guarantees this change relies on are established by
`add-service-foundation`; this change adds a table and two endpoints on top of
them.

## Goals / Non-Goals

**Goals:**

- Make the price-range invariant unbreakable, not merely checked.
- Keep unset criteria meaningful to the matching engine that reads them.

**Non-Goals:**

- Updating, deleting, or listing investors.
- Any behaviour concerning an investor's matches.

## Decisions

### 1. The price-range invariant is a database constraint, not only a validation rule

`max_price >= min_price` is enforced by a check constraint as well as by the
request schema.

The rule is an invariant of the entity rather than a property of one request
shape: an investor whose maximum is below its minimum is not a valid investor,
regardless of how it arrived. Encoding it in the schema means the matching
query can rely on it — the proximity bonus divides by half the range width, and
a negative width would silently invert the bonus.

*Alternative considered:* validating only at the API boundary. Rejected: it
holds only for the one path that happens to validate.

### 2. Optional criteria default rather than remain null

A missing minimum bedroom count or minimum square footage is stored as zero, not
as null.

This is the same three-valued-logic concern that governs the properties table.
In the scoring expression, `bedrooms >= NULL` evaluates to `NULL`, and adding
`NULL` to a running score erases the whole score. A default of zero means "no
minimum", which is what an absent criterion means, and keeps the comparison
total.

The preferred city is the exception: it remains nullable, because "no city
preference" is genuinely different from any city value. The scoring expression
handles that by awarding the city weight to nobody, which leaves the ranking
among properties unchanged.

*Alternative considered:* nullable numeric criteria with `COALESCE` at query
time. Rejected for the same reason as in the properties table.

### 3. A malformed identifier is a bad request, not a missing resource

A non-numeric identifier in the path returns `400`, while a well-formed
identifier matching no row returns `404`.

The distinction is observable and matters to a client: one says "fix your
request", the other says "this does not exist". Collapsing both into `404`
hides client bugs.

## Risks / Trade-offs

- **Defaulting criteria to zero loses the distinction between "no minimum" and
  "not stated".** → They are the same thing for ranking purposes, and the
  ranking is the only consumer.
- **No update endpoint means a typo requires a new investor.** → Accepted; the
  brief specifies creation and retrieval only.

## Migration Plan

1. Migration 002 — `investors` with its check constraints, including the
   price-range invariant.

Rollback is dropping the table; it has no dependents.
