> **Proposal-only.** This change is documentation of a deliberate decision, not
> planned work. It has no specs, design, or tasks and will not be applied.

## Why

The brief contains a contradiction it never resolves, and this records both the
contradiction and why the project answers it the way it does.

`GET /investors/:id/matches` specifies a scoring table and an ordering but never
says who enters the list — it treats a match as a **gradient**. The optional
`GET /analytics/investor-match-rate` asks for "the percentage of properties that
match at least one investor" — which treats a match as a **boolean**. Turning a
gradient into a boolean needs a cut-off, and the brief supplies none.

Measured consequences, using three plausible investors against the 410 valid
properties:

| Definition of "match" | Properties matching at least one investor | Match rate |
|---|---|---|
| No filter (the literal reading) | 410 / 410 | 100% |
| Any non-zero score | 410 / 410 | 100% |
| Score of 70 or above | 87 / 410 | 21% |
| Hard filter on city and price | 87 / 410 | 21% |

The metric is only informative in the lower two rows. Worse, the non-zero
reading degrades as the business grows: every additional investor pushes the
union closer to 100%, so the number becomes less useful the more customers
exist.

`add-lead-matching` adopts the literal reading — rank everything, filter
nothing — for the three reasons recorded in its design. That reading makes the
match-rate endpoint meaningless, so the endpoint is **not implemented** rather
than implemented against an invented constant.

## What Would Change

- An optional `min_score` query parameter on the matching endpoint, defaulting
  to zero so the current behaviour is unchanged. Filtering on a computed score
  requires wrapping the existing scoring statement, which it is already shaped
  for.
- `GET /analytics/investor-match-rate`, reporting the threshold alongside the
  figure so an arbitrary constant becomes an explicit contract:
  `{ min_score, matched_properties, total_properties, match_rate }`.
- A configurable default threshold, since the right value is a product decision
  rather than an engineering one.

## Why Not Now

The threshold is a number nothing in the brief justifies. Choosing 70 would be
inventing a product rule and then reporting analytics derived from it — which
looks like rigour while being arbitrary. Shipping the ranking without a
threshold, and naming the ambiguity, is the more honest answer to an
underspecified requirement.

The additive shape matters: because the default would be zero, adding this later
changes no existing behaviour. Nothing is foreclosed by deferring it.

## Capabilities

None. This change is deliberately not implemented and adds no requirements.
