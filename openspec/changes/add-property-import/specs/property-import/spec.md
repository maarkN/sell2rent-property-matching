## Purpose

Ingests an external property feed into durable storage, admitting well-formed
records and rejecting malformed ones individually with a stated reason, so that
an unreliable upstream feed can never corrupt inventory or halt ingestion.

## ADDED Requirements

### Requirement: Valid property records are persisted

The system SHALL persist every feed record that satisfies all field
constraints, and SHALL report how many records were persisted and how many
were rejected.

#### Scenario: Feed containing only valid records

- **WHEN** an import is requested against a feed of well-formed records
- **THEN** every record is persisted
- **AND** the response reports the persisted count, a rejected count of zero, and an empty rejection list

#### Scenario: Feed containing a mixture of valid and malformed records

- **WHEN** an import is requested against a feed of 420 records of which 410 are well-formed
- **THEN** 410 records are persisted and 10 are rejected
- **AND** the response reports those counts together with one rejection entry per rejected record

### Requirement: Import is idempotent

The system SHALL identify properties by their external identifier and SHALL
NOT create a duplicate for an identifier that is already stored, however many
times an import is requested.

#### Scenario: The same feed is imported twice

- **WHEN** an import completes and the identical feed is imported again
- **THEN** the stored property count is unchanged
- **AND** the second response reports zero newly persisted records

#### Scenario: A later feed adds records to a previously imported set

- **WHEN** a feed containing both previously imported records and new records is imported
- **THEN** only the new records are persisted
- **AND** previously stored records are left unmodified

### Requirement: Malformed records are rejected with a reason

The system SHALL reject any record that violates a field constraint, SHALL
state a reason for each rejection, and SHALL continue processing the remaining
records.

#### Scenario: A required field is absent

- **WHEN** a record omits its price, its city, or its external identifier
- **THEN** that record is rejected with a reason naming the absent field

#### Scenario: A field holds the wrong type

- **WHEN** a record carries a price that is not a number, or a city that is not text
- **THEN** that record is rejected with a reason naming the offending field and its expected type

#### Scenario: A numeric field holds an out-of-range value

- **WHEN** a record carries a negative or zero price
- **THEN** that record is rejected with a reason stating that price must be greater than zero

#### Scenario: A record is empty

- **WHEN** a record carries no fields at all
- **THEN** that record is rejected rather than causing a failure

#### Scenario: A malformed record does not abort the import

- **WHEN** a feed contains a malformed record positioned before well-formed records
- **THEN** the malformed record is rejected
- **AND** every subsequent well-formed record is still persisted

### Requirement: Rejected records remain identifiable without an identifier

The system SHALL make every rejection traceable to its position in the source
feed, including when the rejected record carries no usable external
identifier.

#### Scenario: A rejected record has a null or absent identifier

- **WHEN** a record whose external identifier is null, absent, or not text is rejected
- **THEN** the rejection entry reports the record's position in the source feed
- **AND** the entry's identifier field is empty rather than fabricated

#### Scenario: A rejected record has a usable identifier

- **WHEN** a record carrying a valid external identifier is rejected for another reason
- **THEN** the rejection entry reports both that identifier and the record's position

### Requirement: Stored properties satisfy their constraints regardless of write path

The system SHALL enforce field constraints at the point of storage, so that no
property violating them can exist in storage even if introduced by a path other
than import.

#### Scenario: A non-positive price is written directly to storage

- **WHEN** a write attempts to store a property with a price of zero or less
- **THEN** the write is refused
