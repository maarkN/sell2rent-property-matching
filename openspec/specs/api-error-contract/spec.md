# api-error-contract Specification

## Purpose
Defines the uniform error body, status-code semantics, and startup guarantees
that every endpoint in the service inherits, so that response shape and failure
behaviour are decided once rather than per handler.

## Requirements

### Requirement: Every error shares one response shape

The system SHALL render every error in a single shape carrying a numeric status
code, a short error label, and one human-readable message. This SHALL apply
uniformly to validation failures, missing resources, and unexpected failures
alike, including errors raised by the framework rather than by application code.

#### Scenario: A validation failure and a missing resource are compared

- **WHEN** one request fails validation and another requests a missing resource
- **THEN** both responses carry the same field structure, differing only in their values
- **AND** the message is a single human-readable string in both cases

#### Scenario: An unexpected failure reaches the client

- **WHEN** a handler raises an error that is not an anticipated failure
- **THEN** the response reports `500` in that same shape
- **AND** the message does not leak a stack trace or internal detail

#### Scenario: The framework raises the error itself

- **WHEN** a request fails before reaching a handler, such as a route that does not exist
- **THEN** the response still carries the same shape rather than the framework's default body

### Requirement: Successful responses carry no envelope

The system SHALL return success payloads exactly as each endpoint's contract
specifies, without wrapping them in a shared envelope carrying status,
metadata, or a nested data field.

#### Scenario: An endpoint whose contract is an object

- **WHEN** an endpoint whose contract specifies an object responds successfully
- **THEN** that object is the response body, with no wrapping fields added

#### Scenario: An endpoint whose contract is an array

- **WHEN** an endpoint whose contract specifies an array responds successfully
- **THEN** the response body is that array itself, not an object containing it

### Requirement: Invalid input is refused before reaching business logic

The system SHALL validate request bodies and query parameters against a
declared schema at the API boundary, SHALL respond with `400` when validation
fails, and SHALL report which field was rejected.

#### Scenario: A request body violates its schema

- **WHEN** a request body omits a required field or supplies a value of the wrong type
- **THEN** the response reports `400` in the standard error shape
- **AND** the message names the offending field

#### Scenario: A query parameter arrives as text

- **WHEN** a numeric query parameter arrives as a string, as query parameters always do
- **THEN** it is coerced to a number before validation rather than rejected for its type

#### Scenario: A validated request reaches the handler

- **WHEN** a request satisfies its schema
- **THEN** the handler receives the parsed value with any documented defaults already applied

### Requirement: The service refuses to start on an invalid configuration

The system SHALL validate its entire configuration at startup and SHALL refuse
to start when configuration is missing or malformed, rather than failing later
on the first request that happens to need it.

#### Scenario: A required setting is absent

- **WHEN** the service starts without its database connection setting
- **THEN** startup fails with a message naming the missing setting
- **AND** no port is bound

#### Scenario: Several settings are invalid at once

- **WHEN** the service starts with more than one invalid setting
- **THEN** the failure names every invalid setting, not only the first

#### Scenario: Configuration is complete

- **WHEN** every setting is present and valid
- **THEN** the service starts and reports a successful database connection

### Requirement: Operational events are logged as structured records

The system SHALL emit logs as structured records rather than free text, and
SHALL record a failure's message and stack rather than an empty object.

#### Scenario: A failure is logged

- **WHEN** an error is logged
- **THEN** the emitted record contains the error's message and stack

#### Scenario: A skipped feed record is logged

- **WHEN** a record is rejected during import
- **THEN** the rejection reason is logged in a structured record identifying that record
