## Why

With inventory stored and demand captured, the product question becomes: for
this investor, which properties should be shown first? That ranking is the core
of the service and the brief's most heavily specified endpoint — and the one
whose correctness is easiest to get quietly wrong.

## What Changes

- Score every stored property against an investor's criteria using the brief's
  weighted model, and return the inventory in rank order.
- Add a price proximity bonus, whose formula the brief leaves undefined, with
  the guards that keep it inside its stated range.
- Order results deterministically, so paginating the full set returns every
  property exactly once.
- Paginate with a bounded page size and report the total.

### A scope decision the brief forces

The brief specifies a scoring table and an ordering but never states who enters
the list. **Matching ranks the whole inventory; it does not filter it.** A hard
filter on city and price would make 70 of the 100 available points constant
across every returned row, and would return an empty list to an investor whose
criteria fall in a gap in the inventory. Reasoning is in `design.md`; the
alternative reading is preserved as `add-match-score-threshold`.

## Capabilities

### New Capabilities

- `lead-matching`: scoring and ranking stored properties for a given investor —
  the scoring model, the proximity bonus, ordering and tie-breaking, and
  pagination.

### Modified Capabilities

None.

## Impact

- **New endpoint.** `GET /investors/:id/matches`.
- **No new tables.** Reads `properties` and `investors` as they stand.
- **Query shape.** Ranking is computed and paginated in the datastore in a
  single statement; no index can serve it, which is a deliberate and documented
  consequence.

## Non-goals

- Any match threshold or minimum score. See `add-match-score-threshold`.
- Caching or precomputing scores. See `add-match-score-caching` if introduced.
- Ranking across multiple investors at once.
