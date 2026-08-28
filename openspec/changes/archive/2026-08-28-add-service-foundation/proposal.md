## Why

Nothing runs yet: the repository holds the brief and a data file. Every later
capability needs the same things first — a service that boots, a database it can
reach, one way to report an error, and one way to reject bad input. Deciding
those once, before any endpoint exists, is what keeps the four feature changes
that follow from each inventing their own.

## What Changes

- Scaffold the service with strict TypeScript and the layer boundaries the
  project's conventions define.
- Validate the entire configuration at startup, so an incomplete environment
  fails at boot rather than on the first request that needs the missing value.
- Establish one error body for the whole API, produced centrally rather than
  assembled per handler.
- Establish schema-based validation at the API boundary, returning `400` with
  the offending field named.
- Add structured logging that records a failure's message and stack.
- Add a one-command local environment so the service and its database start
  together.

## Capabilities

### New Capabilities

- `api-error-contract`: the uniform error body, status-code semantics, input
  validation behaviour, startup configuration guarantees, and logging format
  every endpoint in the service inherits.

### Modified Capabilities

None. This change introduces the service.

## Impact

- **New codebase.** Application skeleton, layer folders, and the composition
  root that binds contracts to implementations.
- **New local environment.** A container definition for PostgreSQL and the
  documented environment variables.
- **Cross-cutting.** Every endpoint added by a later change inherits this
  error shape and validation behaviour without restating it.

## Non-goals

- Any business endpoint. This change adds no route that serves data.
- The database schema. Tables arrive with the capability that needs them.
- Authentication and authorization.
