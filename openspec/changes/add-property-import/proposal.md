## Why

The property feed is a file on disk, and it is not trustworthy: of its 420
records, 10 are malformed in ten distinct ways — a price as the text
`"three hundred thousand"`, a negative price, a zero price, a numeric city, a
null identifier, an absent identifier, a bare `{}`, and three shapes missing
required fields. Nothing downstream can be built until that feed is modelled,
ingested, and queryable, and until ingesting it is safe to repeat.

Handling this feed well is one of the brief's explicitly evaluated criteria.

## What Changes

- Model the `properties` table with an external identifier as its unique key,
  and encode the feed's validity rules as database constraints so no write path
  can bypass them.
- Add an import endpoint that validates each record independently, persists the
  valid ones, and reports every rejection with a reason.
- Make import idempotent, so repeated runs never duplicate a property.
- Make every rejection traceable to its position in the feed, including the
  three records that carry no usable identifier.

## Capabilities

### New Capabilities

- `property-import`: ingesting the property feed into storage — per-record
  validation, rejection reporting, idempotent writes keyed on the external
  identifier, and the stored property model that later capabilities query.

### Modified Capabilities

None.

## Impact

- **New table.** `properties`, created by a versioned migration with unique and
  check constraints plus indexes.
- **New endpoint.** `POST /properties/import`.
- **Data dependency.** Reads the feed from a configurable path rather than a
  hardcoded one, so tests can point at a fixture.
- **Downstream.** Matching and analytics both read this table; its column
  nullability directly shapes their queries.

## Non-goals

- Updating or removing stored properties. Import is insert-only; reconciling a
  changed listing is separate work.
- Streaming or incremental ingestion. See `add-import-resilience`.
- Fetching the feed over the network.
