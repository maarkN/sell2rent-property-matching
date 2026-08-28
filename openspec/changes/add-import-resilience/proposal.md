> **Proposal-only.** This change is documentation of a deliberate decision, not
> planned work. It has no specs, design, or tasks and will not be applied.

## Why

Import reads the entire feed into memory, validates it, and writes it in
batches within a single request. That is correct for a 77 KB file of 420
records and wrong for a real MLS feed.

Three limits are known and accepted:

- **Memory scales with feed size.** A feed two orders of magnitude larger would
  be held entirely in memory before the first row is written.
- **A transient database failure aborts the whole request.** There is no retry
  and no partial-progress record; recovery is re-running the import, which is
  safe only because the write is idempotent.
- **The caller waits for the whole feed.** A long import ties up a request for
  its full duration, with no way to observe progress.

## What Would Change

- Stream and validate the feed incrementally rather than parsing it whole, so
  memory stays flat regardless of feed size.
- Wrap each batch in a retry with backoff for transient failures, distinguishing
  them from permanent ones such as a constraint violation.
- Record import runs, so a failed run can be resumed and a caller can ask what
  happened without re-reading logs.
- Move import behind a job queue, returning an accepted response with a handle
  rather than blocking for the duration.

## Why Not Now

Every one of these is invisible at the given scale: the whole feed is smaller
than a single page of many APIs, and the import completes well inside a normal
request timeout. Building a queue, a run table, and a retry policy for 420
records would be infrastructure serving a load that does not exist, and it would
enlarge the surface a reviewer has to read.

The idempotent write is what makes deferring this safe — re-running a failed
import is already the correct recovery, so the missing retry costs correctness
nothing, only convenience.

## Capabilities

None. This change is deliberately not implemented and adds no requirements.
