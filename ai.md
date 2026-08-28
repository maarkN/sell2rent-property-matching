# AI Usage Disclosure

## 1️⃣ AI Tools Used

- **Claude Code** (Anthropic, Opus) — the primary tool, used as a pair programmer with terminal, filesystem and database access.
- **OpenSpec** — a spec-driven workflow CLI. Not an AI tool itself, but it is what structured the AI's work: every change had to produce a proposal, a delta spec, a design document and a task list before any code was written, and each was reviewed before implementation began.

No Copilot, no ChatGPT.

---

## 2️⃣ Where AI Was Used

**Honestly: nearly all of the code in `src/` and `tests/` was written by AI.** Pretending otherwise would defeat the purpose of this document. What was mine is the direction, the review, and the decisions — described in section 4.

Specifically, AI wrote:

| Area | Files | Nature of assistance |
|---|---|---|
| Service skeleton | `main.ts`, `app.module.ts`, `shared/config/*`, `interfaces/filters/*`, `interfaces/pipes/*` | Full implementation from a design I approved |
| Schema and migrations | `infrastructure/database/migrations/*.sql`, `migrate.ts` | Full implementation, including the non-null and CHECK constraint reasoning |
| Property import | `domain/entities/property.entity.ts`, `application/usecases/import-properties.usecase.ts`, `infrastructure/repositories/postgres-property.repository.ts` | Full implementation, including the per-record rejection strategy |
| Investor profiles | `domain/entities/investor.entity.ts`, `application/usecases/{create,get}-investor.usecase.ts` | Full implementation |
| Matching engine | `postgres-property.repository.ts` (`rankByFit`), `get-investor-matches.usecase.ts`, `matches.dto.ts` | Full implementation of the scoring SQL and its guards |
| Analytics | `get-top-cities.usecase.ts`, `analytics.controller.ts`, `top-cities.dto.ts` | Full implementation |
| Tests | all of `tests/` | Full implementation — 41 unit, 61 integration |
| Planning artifacts | `openspec/` proposals, delta specs, design documents, task lists | Drafted by AI, reviewed and corrected by me |

It was also used for architecture ideas, for debugging, and for refactoring — most visibly when it caught that adding a second integration suite touching the `properties` table would race with the existing one under Jest's parallel workers, and moved the integration project to serial execution.

---

## 3️⃣ Prompts or Type of Requests

The work ran through OpenSpec's workflow rather than as free-form prompting, so most requests were of the form `/opsx:propose`, `/opsx:apply <change>`, `/opsx:verify <change>`, `/opsx:archive <change>`. Within those, the substantive requests were:

- "Plan this service as a sequence of changes; defer what is not required."
- "Resolve the brief's ambiguity: does matching rank the whole inventory or filter it? Argue from the dataset, not from taste."
- "Define the price proximity bonus the brief leaves undefined, and state every guard it needs."
- "Compute the scoring in SQL. Never load properties into application memory."
- "Verify that the implementation matches the specs before archiving."
- "The design claims X — reproduce it against the seeded database."
- "This is a documented decision with a stated rationale. Do not silently override it; tell me and let me decide."

The last two shaped the result more than any other. Asking for **reproduction rather than assertion** is what surfaced the problems in section 5.

---

## 4️⃣ What Was Fully Written Without AI

Not much code. Being precise about what was actually mine:

- **The decision to use OpenSpec at all**, and the shape of the plan: five implementable changes plus three deliberately deferred proposals (`add-import-resilience`, `add-match-score-threshold`, `add-observability`). Those three exist as `proposal.md` only, never implemented — recording an idea and rejecting it for this scope is a decision, and it was mine.
- **The architecture.** Layer-first clean architecture with the dependency rule pointing inward, DI tokens as Symbols in the domain, Zod at both trust boundaries. I nearly over-engineered this — an early sketch had CQRS and an event bus for a service with five endpoints — and cutting that back was my call.
- **Every judgment call the AI paused on**, and it was instructed to pause rather than guess. Concretely:
  - Documenting the analytics city-count ties instead of fixing them with a secondary sort. The AI recommended adding `city ASC`; I chose to record the limitation and leave the query as the brief specifies.
  - Rejecting two decimal places for the match score once measurement showed it collapses distinct scores.
  - Fixing the two API contract deviations described below rather than shipping them as "known limitations".
- **The review that caught the errors in section 5.** The AI wrote the false claims; the instruction to verify them against the database is what exposed them.

---

## 5️⃣ Validation Process

Four layers, in increasing order of how much they actually caught.

**Type checking.** `tsc --noEmit` under `strict: true` with `noUncheckedIndexedAccess`. This caught real omissions — twice, adding a method to the `PropertyRepository` contract broke an in-memory test fake that the AI had forgotten to update.

**Tests against real PostgreSQL.** 41 unit and 61 integration tests. The integration suite runs against an actual database, never a substitute dialect, because everything risky here is Postgres-specific: the clamped bonus, the integer-division trap, `ORDER BY` resolving a bare name against an output alias. A different engine would reproduce none of them.

**Exercising the running service.** Every endpoint was called with `curl` against a booted instance, not only through supertest. This is what caught the second contract bug below — the test suite was green while the API disagreed with the brief.

**Measuring the AI's claims against the dataset.** This caught the most, and is the part worth reading.

The AI wrote design documents full of specific, confident, checkable numbers. Most were correct. Two were fabricated:

1. **The analytics design asserted that the eight cities hold distinct property counts**, and used that to reject a tie-breaking sort as "speculative". Querying the database: Fort Worth and Austin both hold 54, Dallas and Tampa both hold 50. The premise was simply false, and a decision had been justified on it.

2. **The matching design claimed to have *verified* that properties scoring 95.2312, 95.2349 and 95.2388 come back misordered** under a particular SQL mistake. Those scores do not exist in the dataset — the highest score for the sample investor is 99.6864. The *phenomenon* was real and important: rounding a score in the SQL projection makes `ORDER BY score` sort by the rounded value. But the evidence had been invented. Reproducing it properly found a better case (P0187, P0363, P0029 at 59.383…, all rounding to 59.38) where the aliased form puts the **worst** of the three first.

Both were caught by asking for reproduction. Neither would have been caught by reading the document, because both read as authoritative — the second one literally begins with the word "Verified".

**Two API contract deviations, found by re-reading the brief against the running service:**

- `GET /investors/:id/matches?page=1&limit=20` — the exact query string in the challenge README — returned **400**. A `strict()` schema I had approved for typo protection rejected `limit`, because the implementation had standardised on `page_size`. The endpoint now accepts both, `limit` being canonical.
- `/analytics/top-cities` returned `average_price` where the brief's example shape specifies `avg_price`.

Both are now fixed and covered by tests that use the brief's own spelling.

**The lesson I would draw:** the AI was reliable at writing code that works and unreliable at writing *justifications* for it. Generated prose asserting a measured fact deserves more suspicion than generated code, because the code gets executed and the prose does not. Everything in this repository that reads like a measurement has now been re-derived from the database.

---

I confirm that this document accurately reflects how AI was used in this project.

**Name:** Marco Filho

**Date:** 2026-08-28
