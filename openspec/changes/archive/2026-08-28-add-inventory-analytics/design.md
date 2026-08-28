## Context

See `proposal.md` — Why. This change reads the `properties` table created by
`add-property-import` and inherits the bare-response rule from
`add-service-foundation`: the endpoint's contract is a JSON array, which no
envelope can express.

## Goals / Non-Goals

**Goals:**

- Aggregate in the datastore, transferring one row per city.
- Resolve the brief's ambiguous `total_inventory` field.

**Non-Goals:**

- Match-rate analytics, which need a definition of "match" this project does not
  adopt.
- Filtering, parameterising, or time-slicing the aggregation.

## Decisions

### 1. `total_inventory` is the count of properties, not their summed value

The brief names the field but never defines it, and its example reports
`property_count` and `total_inventory` with the **same value**.

Two readings are available: a count of listings, or the aggregate price of those
listings. The count is adopted, on two grounds — the brief's example shows the
fields agreeing, which the value reading would contradict by three orders of
magnitude; and in real-estate usage "inventory" denotes the number of homes
available rather than their combined price.

The resulting redundancy between the two fields is deliberate and preserved, so
the response matches the specified shape.

*Alternative considered:* summing price and treating the example as a
placeholder. Rejected: unlike the import example's counts, which are plainly
illustrative numbers, two fields agreeing is a structural fact rather than a
rounded figure.

### 2. Outliers are included, and the average is reported as a number

The valid-but-extreme block of the feed skews per-city averages substantially —
one city's mean is roughly 30% higher because of two planted properties. Those
records are valid inventory and are included; excluding them would require an
undocumented rule about what counts as a real listing.

The average is reported as a number rounded to **two decimal places**, matching
the `NUMERIC(12, 2)` the prices themselves are stored at: the report is no more
precise than its inputs, and a currency figure is the one place where two
decimals need no further justification.

Reporting it as a *number* matters because the driver returns fixed-point
aggregates as strings; without an explicit conversion the field would silently
serialise as `"285430.00"`. Rounding in SQL and converting on the way out are
therefore two separate obligations, and only the second one fails loudly.

### 3. Ranking is by property count, and ties are left to the datastore

Cities are ordered by property count descending, as the brief specifies. No
secondary ordering is imposed.

**The dataset contains ties, and this is a known limitation rather than an
absence of one.** Measured over the 410 stored properties, the eight cities do
not hold eight distinct counts:

| City | Properties |
|---|---|
| Fort Worth | 54 |
| Austin | 54 |
| Jacksonville | 53 |
| San Antonio | 52 |
| Houston | 51 |
| Dallas | 50 |
| Tampa | 50 |
| Orlando | 46 |

Fort Worth and Austin tie at 54, and Dallas and Tampa tie at 50. With ordering
by count alone, the relative position of each tied pair is whatever the plan
happens to emit; it is not guaranteed across executions and must not be relied
upon. Every requirement the brief states still holds — counts are ranked
descending — but the ordering is *partial*, not total.

This is recorded rather than fixed, deliberately. The tests assert that counts
are non-increasing and never that a particular tied city comes first, so the
suite does not encode an order the query does not promise.

*Alternative considered and deferred:* a secondary `city ASC`, making the
ordering total for the cost of one clause. It is the obvious remedy and the
first thing to add if reproducible ordering becomes a requirement; it is left
out here only because the brief specifies ranking by count and nothing else.

## Risks / Trade-offs

- **Averages are skewed by planted outliers.** → Correct behaviour: they are
  valid inventory. Documented so the figure is not mistaken for a typical price.
- **`total_inventory` duplicates `property_count`.** → Follows the brief's own
  example; the reasoning is recorded here and surfaced in the submission notes.
- **No secondary sort, and the data does tie.** Two pairs of cities share a
  count, so the order within each pair is not reproducible. → Accepted for now
  and documented in Decision 3; the tests assert only that counts are
  non-increasing, so nothing depends on the unguaranteed order. Adding
  `city ASC` is the one-line remedy when reproducibility is required.

## Migration Plan

No schema change. The city index it relies on is created by
`add-property-import`.
