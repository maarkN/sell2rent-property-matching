## Why

Matching ranks inventory against demand, and demand has nowhere to live. An
investor's buying criteria — a price range, a preferred city, minimum size and
bedroom count — must be captured and retrievable before anything can be ranked
against them.

## What Changes

- Model investors and their buying criteria, with the price-range invariant
  enforced by the database rather than only by application code.
- Add an endpoint to create an investor, rejecting invalid input with `400`.
- Add an endpoint to retrieve an investor by identifier, answering `404` when
  no such investor exists.

## Capabilities

### New Capabilities

- `investor-profiles`: creating and retrieving investors together with their
  buying criteria, including input validation and not-found behaviour.

### Modified Capabilities

None.

## Impact

- **New table.** `investors`, created by a versioned migration with check
  constraints including the price-range invariant.
- **New endpoints.** `POST /investors` and `GET /investors/:id`.
- **Downstream.** The matching engine reads a profile through this capability's
  contract; criteria left unset here must remain meaningful there.

## Non-goals

- Updating or deleting investors.
- Listing all investors. That is a small optional addition, not a requirement.
- Any notion of an investor's match results, which belongs to `add-lead-matching`.
