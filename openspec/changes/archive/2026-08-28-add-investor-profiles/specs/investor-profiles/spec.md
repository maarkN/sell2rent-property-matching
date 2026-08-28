## Purpose

Captures an investor together with the buying criteria that describe what they
are looking for, and makes that profile retrievable, so the matching engine has
a stable definition of demand to rank inventory against.

## ADDED Requirements

### Requirement: An investor is created from valid buying criteria

The system SHALL accept an investor consisting of a name and buying criteria —
a price range, an optional preferred city, a minimum bedroom count, and a
minimum square footage — and SHALL return the stored profile with an
identifier that can be used to retrieve it.

#### Scenario: Creation with complete criteria

- **WHEN** an investor is submitted with a name, a price range, a preferred city, a minimum bedroom count, and a minimum square footage
- **THEN** the investor is stored
- **AND** the response reports `201` and includes the assigned identifier alongside the submitted criteria

#### Scenario: Creation with only the required criteria

- **WHEN** an investor is submitted without a preferred city, a minimum bedroom count, or a minimum square footage
- **THEN** the investor is stored with those criteria left unset or defaulted
- **AND** the profile remains usable for matching

### Requirement: Invalid investor input is rejected

The system SHALL reject an investor whose input violates a field constraint,
SHALL respond with `400`, and SHALL NOT store a partial profile.

#### Scenario: A required field is absent or blank

- **WHEN** an investor is submitted without a name, or with a name that is empty or only whitespace
- **THEN** the request is rejected with `400` and a message naming the offending field

#### Scenario: A numeric criterion is out of range

- **WHEN** an investor is submitted with a negative price, a negative bedroom count, or a negative square footage
- **THEN** the request is rejected with `400`

#### Scenario: A field holds the wrong type

- **WHEN** an investor is submitted with a price that is not a number
- **THEN** the request is rejected with `400`

#### Scenario: The price range is inverted

- **WHEN** an investor is submitted whose maximum price is below its minimum price
- **THEN** the request is rejected with `400` and a message stating that the maximum must not be below the minimum

#### Scenario: A rejected investor is not stored

- **WHEN** an investor submission is rejected
- **THEN** no investor profile exists for that submission
- **AND** a subsequent valid submission is unaffected

### Requirement: An investor profile is retrievable by identifier

The system SHALL return the stored profile and its buying criteria when
requested by identifier.

#### Scenario: Retrieving an existing investor

- **WHEN** a profile is requested by the identifier of a stored investor
- **THEN** the response reports `200` and contains the investor's name and every buying criterion

#### Scenario: Retrieving an investor that does not exist

- **WHEN** a profile is requested by an identifier that matches no stored investor
- **THEN** the response reports `404` and states which identifier was not found

#### Scenario: Retrieving with a malformed identifier

- **WHEN** a profile is requested by an identifier that is not a valid identifier value
- **THEN** the response reports `400` rather than treating it as a missing resource
