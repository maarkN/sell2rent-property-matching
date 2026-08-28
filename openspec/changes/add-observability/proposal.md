> **Proposal-only.** This change is documentation of a deliberate decision, not
> planned work. It has no specs, design, or tasks and will not be applied.

## Why

The service emits structured logs and nothing else. That is enough to debug a
failure after the fact and not enough to notice one, or to answer whether the
service is healthy without making a request that changes data.

Three gaps are known and accepted:

- **No health endpoint.** Determining whether the service can reach its database
  requires calling a business endpoint.
- **No request correlation.** Log lines from one request cannot be grouped, so a
  failure spanning several components has to be reassembled by timestamp.
- **No metrics.** Request rate, latency, and error rate are unmeasured, and the
  matching query's full-scan cost is invisible — which is precisely the number
  that would matter first as inventory grows.

## What Would Change

- A readiness endpoint reporting database reachability, and a liveness endpoint
  that does not touch the database.
- A request identifier generated per request, attached to every log line and
  echoed in a response header, so one request's lines can be selected.
- Request duration, count, and error metrics, with the matching query's duration
  tracked separately given it is the operation whose cost grows with inventory.
- Slow-query logging above a configured threshold.

## Why Not Now

The brief asks for logged reasons on skipped records and nothing further, and
the deliverable runs locally against a container rather than in an environment
where anything would scrape a metrics endpoint or act on an alert.

Health endpoints are the cheapest of these and the closest call. They are
deferred with the rest because they are only meaningful to an orchestrator, and
there is none here — adding them would be answering a question nobody in this
deployment is asking.

## Capabilities

None. This change is deliberately not implemented and adds no requirements.
