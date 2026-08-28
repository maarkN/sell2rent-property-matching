## Why

Inventory is only useful if its shape is legible: which markets hold the most
properties, and at what price. Answering that by reading listings one at a time
does not scale and is not what the brief asks for.

## What Changes

- Report per-city property counts, average price, and total inventory,
  aggregated in the datastore.
- Rank cities by property count.
- Resolve the brief's ambiguous `total_inventory` field to a documented meaning.

## Capabilities

### New Capabilities

- `inventory-analytics`: aggregate reporting over stored inventory, starting
  with per-city counts, average price, and total inventory.

### Modified Capabilities

None.

## Impact

- **New endpoint.** `GET /analytics/top-cities`, returning a bare array.
- **No new tables.** Reads `properties`.
- **Index relevance.** This is the one query in the service that an index can
  actually serve, which is why the city index exists.

## Non-goals

- Match-rate analytics, which require a definition of "match" this project does
  not adopt. See `add-match-score-threshold`.
- Time-series or historical reporting; there is no temporal dimension in the
  feed.
- Filtering or parameterising the aggregation.
