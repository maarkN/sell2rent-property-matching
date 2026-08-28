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

The average is reported at a fixed documented precision as a number, not as
text. This matters because the driver returns fixed-point aggregates as strings;
without an explicit conversion the field would silently serialise as `"285430.00"`.

### 3. Ranking is by property count, and ties are left to the datastore

Cities are ordered by property count descending, as the brief specifies. With
eight cities and distinct counts there is no tie to break, so no secondary
ordering is imposed.

*Alternative considered:* adding a secondary alphabetical ordering for
determinism. Rejected as speculative for a fixed eight-row result; it would be
warranted if the city set were open-ended.

## Risks / Trade-offs

- **Averages are skewed by planted outliers.** → Correct behaviour: they are
  valid inventory. Documented so the figure is not mistaken for a typical price.
- **`total_inventory` duplicates `property_count`.** → Follows the brief's own
  example; the reasoning is recorded here and surfaced in the submission notes.
- **No secondary sort.** → Safe for a fixed, small city set; noted as the first
  thing to add if the data widens.

## Migration Plan

No schema change. The city index it relies on is created by
`add-property-import`.
