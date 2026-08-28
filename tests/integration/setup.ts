// Integration tests touch a real database; the default 5s is too tight for
// container start-up and migration on a cold run.
jest.setTimeout(30_000);
