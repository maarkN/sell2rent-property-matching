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
against output aliases before input columns. Properties differing beyond the
rounded precision then collapse into a tie and are ordered by identifier rather
than by fit.

Reproduced against the seeded database with the brief's sample investor
(Houston, 150,000–300,000, 3 bedrooms, 1,200 sq ft). Three properties score
within 0.005 of one another:

| Property | Score | Rounded to 2 |
|---|---|---|
| P0187 | 59.38333… | 59.38 |
| P0363 | 59.38193… | 59.38 |
| P0029 | 59.37886… | 59.38 |

Ordering by the rounded alias returns **P0029, P0187, P0363** — the worst fit of
the three placed first, because the scores collapsed to a tie and the
identifier tie-break then decided the whole group. Ordering before rounding
returns P0187, P0363, P0029, which is the actual fit order.

That is the failure this decision exists to prevent: it is silent, it produces
a plausible-looking list, and it inverts precisely the ranking the endpoint is
for.

Two fixes work; rounding outside SQL is preferred because it makes presentation
actually presentational. The alternative is to qualify the ordering name so it
resolves as an expression.

### 4. The result total travels with the page, including when the page is empty

The total is obtained in the same statement as the page rather than by a second
counting query, so pagination costs one round trip.

**A bare `COUNT(*) OVER ()` does not survive the last page.** A window function
is evaluated per returned row, so a page past the end returns no rows at all —
and therefore no total. The spec requires that request to answer `200` with the
total still reflecting the full result set, which that shape cannot do: the
field would read 0 exactly when the caller most needs it to say how far they
overshot.

Decision 1 makes the fix available. Because ranking never filters, the result
set is always the whole inventory, so the total is `COUNT(*)` over `properties`
and does not depend on the page at all. Computing it as its own row source and
attaching the page to it keeps one round trip while guaranteeing a row exists:

```sql
SELECT t.total, p.*
  FROM (SELECT COUNT(*) AS total FROM properties) t
  LEFT JOIN LATERAL (
    -- ranked, ordered, LIMIT/OFFSET page
  ) p ON TRUE
```

`LEFT JOIN LATERAL ... ON TRUE` always yields at least one row: on an empty
page, that row carries the total with null property columns, which the mapping
reads as an empty page rather than a zero total.

*Alternative considered:* a second `SELECT COUNT(*)` statement. Rejected — it
costs a second round trip to answer a question the first statement already had
the information for.

### 5. No index can serve this query, and that is stated rather than hidden

The query evaluates an expression over every row and orders by a computed
column: a full scan followed by a sort, by construction. At this row count the
planner would scan sequentially regardless. The path to scaling is a
materialised score or a pre-filter, not an index.

### 6. The pagination bounds and the reported precision, stated as numbers

The spec requires "documented defaults" and a "permitted maximum" without
naming them, and requires the score to be reported "at a stated precision"
without stating it. Naming them here is what makes those requirements
verifiable rather than self-referential:

| Parameter | Value |
|---|---|
| `page` default | 1 |
| `page_size` default | 20 |
| `page_size` maximum | 100 |
| reported `score` precision | 4 decimal places |

The page size is bounded because it is caller-controlled: without a maximum,
`page_size=100000` makes a single request materialise the entire inventory and
quietly undoes the memory guarantee the spec states as a requirement. 100 caps
a page at roughly a quarter of the 410-row dataset, which is generous for a
list a person reads and still far from unbounded.

**Four decimal places on the score, not two, and the difference was measured.**
The proximity bonus divides by half the range width, so scores are repeating
decimals whose spacing depends on the investor's range rather than on anything
fixed. Counting distinct scores across the 410 properties at several precisions:

| Investor | Distinct scores | At 4 dp | At 3 dp | At 2 dp | Smallest gap |
|---|---|---|---|---|---|
| Brief's sample (Houston, 150–300k) | 189 | 189 | 189 | 182 | 0.00073 |
| Austin, 200–600k | 328 | 327 | 322 | 268 | 0.000025 |
| Tampa, 100–250k | 150 | 150 | 150 | 149 | 0.0047 |
| No city, 300k–1M | 190 | 190 | 185 | 149 | 0.0001 |

Two decimals lose distinctions in *every* profile measured, and up to 41 of 190
in the worst. Four lose at most one pair. Three sit in between and buy little.

**No fixed precision removes the problem, and that is why the spec allows for
it.** Price is continuous within the range, so two properties can always sit
arbitrarily close to the midpoint — the Austin profile already produces a pair
0.000025 apart. Rounding is therefore a *display* concern with an irreducible
residual, which is exactly what the spec's "scores may appear equal" scenario
describes. Decision 3 is what keeps that residual out of the ordering, where it
would do real damage.

### 7. The matches response is shaped; this does not reintroduce an envelope

The body is:

```json
{ "data": [ ... ], "meta": { "page": 1, "page_size": 20, "total": 410 } }
```

This needs saying because `api-error-contract` already requires that success
responses "carry no envelope", naming "a nested data field" specifically, and
`add-inventory-analytics` reaffirms the rule. Read carelessly, that requirement
and this one contradict each other.

They do not. The rule forbids a *shared* envelope imposed uniformly on every
endpoint — `{ statusCode, message, metadata, data }` wrapped around whatever a
handler returned, which is what would break `POST /properties/import` and
`GET /analytics/top-cities`, whose shapes the brief specifies exactly. Here the
brief specifies no shape at all, and pagination has to report a total
somewhere: `data` and `meta` are this endpoint's own contract, not a wrapper
around a different one.

The distinction is: no endpoint's specified shape is ever wrapped, and no
uniform envelope is applied across endpoints. `GET /investors/:id/matches` is
the only endpoint in the service with a shape of its own to define.

Each entry in `data` is a property with its `score` attached, rounded per
Decision 6.

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
