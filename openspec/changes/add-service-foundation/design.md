## Context

See `proposal.md` — Why. Nothing exists yet, so every decision here is about
where a cross-cutting concern lives rather than how to change an existing one.

Two constraints from the brief shape all of it: response shapes are specified
per endpoint and are bare, and response-shape consistency is a graded criterion.

## Goals / Non-Goals

**Goals:**

- Decide the error body once, in one place, including for framework-raised errors.
- Make an invalid configuration a boot failure rather than a runtime surprise.
- Give later changes a validation mechanism they extend rather than reinvent.

**Non-Goals:**

- Business endpoints, tables, or domain rules.
- Tuning, caching, or observability beyond structured logs.

## Decisions

### 1. Hand-written SQL throughout; no ORM or query builder

`node-postgres` is the only data-access dependency. Repository implementations
issue SQL directly, and the two analytical queries added by later changes are
written by hand.

The deciding argument is that an ORM's core service — mapping rows to objects —
is already performed by hand here: repository interfaces live in the domain and
return rich domain entities, so an ORM would map rows into its own
representation only for that representation to be immediately unmapped.

*Alternatives considered:* Prisma (rejected: its raw-query escape hatch would be
required for precisely the queries that matter, and its migration format
conflicts with versioned `.sql` migrations); Kysely or Drizzle (rejected as
unnecessary rather than unsuitable — a typed builder buys compile-time safety on
CRUD that is trivial here); TypeORM (rejected).

### 2. Validation at both trust boundaries, using one tool

The same schema library validates incoming HTTP payloads *and* rows returned
from the database.

A typed query call is an assertion, not a verification: the driver checks
nothing and the compiler believes the declared type. A renamed column or an
altered migration then produces `undefined` at runtime in code that
`strict: true` declared safe. Two concrete cases make this more than
theoretical: `NUMERIC` columns are returned as **strings**, and a windowed
`COUNT(*)` returns `BIGINT`, also as a string.

The two boundaries get deliberately different failure policies: malformed
*input* is expected and is reported to the caller, whereas a malformed
*database row* is a defect in our own SQL and throws.

*Alternative considered:* trusting the generic and relying on integration tests.
Rejected: the tests would have to enumerate every column to catch drift.

### 3. One global filter owns the error shape

A single exception filter renders every error as
`{ statusCode, error, message }`. Handlers contain no `try`/`catch` and never
construct an error body.

Per-handler error construction is exactly how shape consistency decays, and the
framework's own validation exception serialises `message` as an **array**, which
does not match the required contract. The filter is therefore what reconciles
framework errors with the contract, not an optional nicety.

*Alternative considered:* a per-controller error helper. Rejected: it is
optional at each call site, so the first handler that forgets it diverges
silently.

### 4. Responses are bare; no envelope is introduced

Success payloads match each endpoint's contract exactly and are never wrapped.

This is worth stating because wrapping responses in a
`{ statusCode, message, metadata, data }` envelope is a common house style and
would contradict the brief's specified shapes — one endpoint's contract is a
bare array, which no envelope can express.

### 5. Configuration is parsed once at boot into typed values

The whole environment is validated against a schema at startup. Consumers read
typed properties, not string keys.

*Alternative considered:* a `get(key: string)` accessor that throws on a missing
required key. Rejected on two counts: a misspelled key compiles and returns
undefined, and a value read only by a rarely-exercised path can survive a deploy
before failing.

### 6. Composition happens in exactly one place

One module binds every domain contract to its implementation. Tokens are
symbols declared in the domain beside the interface they name.

*Alternative considered:* string tokens at the registration site. Rejected: a
string token is a name with no definition, and registering the same string twice
silently replaces the earlier binding rather than failing.

## Risks / Trade-offs

- **A global filter can flatten a useful error into a generic one.** → Errors
  carry their intended status and message; only genuinely unexpected failures
  become `500`, and those are logged with their stack before the body is built.
- **Boot-time configuration validation makes startup stricter.** → That is the
  point; the failure names every invalid setting at once.
- **No ORM means hand-written CRUD.** → The volume is small, and the row-schema
  validation from Decision 2 covers the mapping risk that an ORM would.

## Migration Plan

Greenfield. This change creates no tables; each later change adds its own
migration. Rollback is discarding the branch.
