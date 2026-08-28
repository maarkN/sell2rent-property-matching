## 1. Project skeleton

- [ ] 1.1 Initialise the service with `strict: true` and `noImplicitAny`, and verify `tsc --noEmit` passes
- [ ] 1.2 Create the layer folders and path aliases, restating the aliases in the test runner config, and verify an aliased import resolves in both `tsc --noEmit` and a trivial passing test
- [ ] 1.3 Add the local container definition for PostgreSQL, and verify `docker compose up -d` followed by a readiness check reports the database accepting connections

## 2. Configuration

- [ ] 2.1 Define the environment schema covering every setting the service reads, and verify `.env.example` lists exactly those names
- [ ] 2.2 Implement the typed config accessor, and verify startup fails naming every invalid setting at once when two are wrong
- [ ] 2.3 Implement the connection pool fed by the config, and verify a trivial query succeeds through it

## 3. Error contract

- [ ] 3.1 Implement the global exception filter producing the required error body, and verify a deliberate not-found and an unexpected failure return the same field structure
- [ ] 3.2 Register the filter globally, and verify a request to an unknown route returns that shape rather than the framework default
- [ ] 3.3 Verify an unexpected failure returns `500` without a stack trace in the body

## 4. Input validation

- [ ] 4.1 Implement the schema validation pipe, and verify an invalid payload returns `400` through the filter with the offending field named
- [ ] 4.2 Verify a numeric query parameter arriving as text is coerced rather than rejected, and that documented defaults reach the handler

## 5. Logging

- [ ] 5.1 Implement the structured logger with an explicit error parameter, and verify a logged failure renders its message and stack rather than an empty object

## 6. Composition

- [ ] 6.1 Wire the composition root binding contracts to implementations, and verify no file in the domain layer imports the framework, the database driver, or the validation library
