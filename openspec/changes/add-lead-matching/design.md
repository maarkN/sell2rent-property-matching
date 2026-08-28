## Context

See `proposal.md` — Why. Ranking reads the tables created by
`add-property-import` and `add-investor-profiles`, and depends on their
non-nullability: the scoring expression is a sum, and `NULL` anywhere in it
erases the row's entire score.

Two figures from the dataset drive the decisions below. Measured against the
brief's own sample investor across the 410 valid properties, the largest group
of properties sharing a score is **131**, and a property priced at 5,000,000
against a 150,000–300,000 range produces a raw proximity bonus of **−313.3**.

## Goals / Non-Goals

**Goals:**

- Resolve the brief's ranking-versus-filtering ambiguity explicitly.
- Define the proximity bonus the brief leaves undefined, with the guards that
  keep it in range.
- Make ordering total, so pagination is trustworthy.

**Non-Goals:**

- Any threshold or minimum score. See `add-match-score-threshold`.
- Caching or precomputing scores.

## Decisions

### 1. Matching ranks the entire inventory; it never filters it

Every stored property receives a score and is returned in rank order. Nothing is
excluded. Three pieces of evidence make this the correct reading:

- **A hard filter would make 70 of the 100 points constant.** If city and price
  range were requirements, every returned row would carry 40 + 30 by
  construction, collapsing the useful scale to the remaining 30 points. Points
  are not awarded for criteria that were already mandatory.
- **The tie-breaking rule presupposes a large result set.** The brief specifies
  ordering ties by external identifier. Under this reading the largest tie group
  is 131 properties; under a hard filter the entire result set is 24 rows.
- **A hard filter returns empty lists to reasonable investors.** An investor
  seeking properties in one city between 800,000 and 2,000,000 matches nothing:
  that city holds 54 properties, but the band is empty — real listings stop near
  568,000 and the planted outliers resume at 2,500,000. A ranked list degrades
  gracefully and surfaces the closest available alternatives, which is the point
  of a matching engine.

*Alternatives considered:* a hard filter on city and price (rejected for the
three reasons above); excluding zero scores (rejected: it removes 8 of 410 rows,
so it is a filter in name only); a configurable threshold (deferred to
`add-match-score-threshold` rather than rejected).

### 2. The proximity bonus is a clamped linear distance from the range midpoint

```
mid   = (min_price + max_price) / 2
half  = (max_price - min_price) / 2
bonus = clamp(5 * (1 - |price - mid| / half), 0, 5)
```

It peaks at 5 at the midpoint and reaches exactly 0 at both range boundaries, so
the bonus discriminates only *within* the range and never competes with the
30-point in-range award.

Three guards are mandatory, and each corresponds to a real record or input:

| Guard | Without it |
|---|---|
| Clamp at zero | A 5,000,000 property against a 150,000–300,000 range yields a raw bonus of −313.3 and a total score of −288.3: negative, violating the stated 0–5 range and corrupting the ordering |
| Cast to a fractional type before dividing | With integer operands the division truncates, so the bonus degenerates to 0 or 5 and never takes an intermediate value. The failure is silent — the query still returns plausible scores |
| Zero-width range branch | An investor whose minimum equals their maximum gives a half-width of zero and divides by zero |

*Alternative considered:* applying the bonus only to in-range properties via a
conditional. Rejected as redundant: the clamp already yields zero outside the
range, and one guard is easier to verify than two code paths.

### 3. Ordering uses full precision; rounding happens at the HTTP edge

The score is ordered at full precision and rounded only when serialised.

**Rounding must not happen in the projection.** Writing the obvious thing —
selecting a rounded score under the alias `score` and then ordering by `score` —
silently sorts by the *rounded* value, because a bare ordering name resolves
against output aliases before input columns. Two properties differing by 0.004
then collapse into a tie and are ordered by identifier rather than by fit.
Verified: rows scoring 95.2312, 95.2349 and 95.2388 come back in the order
95.2388, 95.2312, 95.2349 under the aliased form.

Two fixes work; rounding outside SQL is preferred because it makes presentation
actually presentational. The alternative is to qualify the ordering name so it
resolves as an expression.

### 4. The result total travels with the page

The total row count is obtained by a window function in the same statement
rather than by a second counting query, so pagination costs one round trip.

### 5. No index can serve this query, and that is stated rather than hidden

The query evaluates an expression over every row and orders by a computed
column: a full scan followed by a sort, by construction. At this row count the
planner would scan sequentially regardless. The path to scaling is a
materialised score or a pre-filter, not an index.

## Risks / Trade-offs

- **Ranking the whole inventory returns implausible rows.** A 5,000,000 property
  appears in the results for an investor capped at 300,000, albeit last. →
  Accepted and documented. Ordering guarantees it never displaces a genuine
  candidate, and `add-match-score-threshold` records the alternative reading.
- **Full scan plus sort on every request.** → Inherent to computing the ranking
  in the datastore, which the brief requires. The scaling path is recorded above
  rather than pre-built.
- **The proximity formula is invented.** → Its boundary behaviour and its three
  guards are documented and tested, so the reasoning is auditable even if a
  reviewer imagined a different curve.

## Migration Plan

No schema change. This change adds a query and an endpoint over existing tables.
Rollback is removing the endpoint.
