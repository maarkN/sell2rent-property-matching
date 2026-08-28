## Purpose

Ranks the stored property inventory against a given investor's buying criteria,
producing an ordered, paginated list in which better-fitting properties appear
first, so that inventory can be presented to an investor in priority order.

## ADDED Requirements

### Requirement: Every stored property is ranked, and none is excluded

The system SHALL assign a fit score to every stored property for the requested
investor and SHALL return them in rank order. Scoring criteria SHALL act as
ranking weights, never as filters: a property SHALL NOT be withheld for failing
any criterion.

#### Scenario: An investor whose criteria match a small part of the inventory

- **WHEN** matches are requested for an investor whose preferred city holds a minority of the inventory
- **THEN** the result set spans the entire stored inventory, not only the properties in that city
- **AND** properties in the preferred city rank above otherwise-comparable properties elsewhere

#### Scenario: An investor whose criteria match nothing exactly

- **WHEN** matches are requested for an investor whose preferred city holds no inventory and whose price range contains no property
- **THEN** a ranked result set is still returned rather than an empty one
- **AND** the properties that satisfy the remaining criteria rank highest

### Requirement: The fit score is the sum of weighted criteria

The system SHALL compute a property's fit score by awarding a fixed weight for
each criterion the property satisfies: 40 when the property's city equals the
investor's preferred city, 30 when its price falls within the investor's
inclusive price range, 15 when its bedroom count is at or above the investor's
minimum, and 10 when its square footage is at or above the investor's minimum.
A property satisfying no criterion SHALL score zero before any bonus.

#### Scenario: A property satisfying every criterion

- **WHEN** a property matches the preferred city, falls within the price range, and meets both minimums
- **THEN** its score before any bonus is 95

#### Scenario: A property satisfying no criterion

- **WHEN** a property is outside the preferred city and the price range, and falls below both minimums
- **THEN** its score is zero

#### Scenario: A criterion is met exactly at its boundary

- **WHEN** a property's bedroom count equals the investor's minimum, its square footage equals the investor's minimum, and its price equals the investor's maximum
- **THEN** all three criteria count as satisfied

#### Scenario: The investor states no preferred city

- **WHEN** matches are requested for an investor with no preferred city
- **THEN** no property receives the city weight
- **AND** the ranking among properties is unaffected by their city

### Requirement: A price proximity bonus refines ranking inside the price range

The system SHALL award an additional bonus of between 0 and 5 points based on
how close a property's price sits to the midpoint of the investor's price
range. The bonus SHALL reach its maximum at the midpoint, SHALL fall to zero at
both ends of the range, and SHALL never be negative nor exceed 5.

#### Scenario: A property priced at the midpoint of the range

- **WHEN** a property's price equals the midpoint of the investor's price range
- **THEN** it receives the full bonus of 5

#### Scenario: A property priced at a boundary of the range

- **WHEN** a property's price equals the investor's minimum or maximum price
- **THEN** it receives a bonus of zero
- **AND** it still receives the full weight for falling within the range

#### Scenario: A property priced far outside the range

- **WHEN** a property's price is many times the investor's maximum price
- **THEN** its bonus is zero rather than negative
- **AND** its total score is never negative

#### Scenario: The investor's price range has zero width

- **WHEN** an investor's minimum price equals their maximum price
- **THEN** the request succeeds rather than failing
- **AND** a property priced at exactly that value receives the full bonus, while every other property receives none

#### Scenario: Two properties differ only slightly in price

- **WHEN** two properties satisfy identical criteria but sit at different distances from the range midpoint
- **THEN** the property nearer the midpoint ranks higher

### Requirement: Results are deterministically ordered

The system SHALL order results by fit score in descending order, and SHALL
break ties by external identifier in ascending order. The ordering SHALL be
total, so that paginating through the full result set yields every property
exactly once.

#### Scenario: Properties share the same score

- **WHEN** several properties score identically
- **THEN** they appear in ascending order of external identifier

#### Scenario: The full result set is paginated through

- **WHEN** every page of a result set is requested in sequence
- **THEN** each stored property appears exactly once across the pages
- **AND** no property is repeated or omitted between consecutive pages

#### Scenario: Ranking distinguishes scores finer than the reported precision

- **WHEN** two properties' scores differ only beyond the precision at which scores are reported
- **THEN** the higher-scoring property ranks first
- **AND** the reported scores may appear equal

### Requirement: Results are paginated with bounded page size

The system SHALL accept a page number and a page size, SHALL apply documented
defaults when they are absent, SHALL reject values outside their permitted
range, and SHALL report enough information to determine the total number of
results.

#### Scenario: Pagination parameters are omitted

- **WHEN** matches are requested without a page number or page size
- **THEN** the first page is returned at the default page size

#### Scenario: A page beyond the end of the result set is requested

- **WHEN** a page number beyond the last page is requested
- **THEN** an empty result page is returned with `200`
- **AND** the reported total still reflects the full result set

#### Scenario: An invalid pagination parameter is supplied

- **WHEN** a page number below one, a non-numeric page size, or a page size above the permitted maximum is requested
- **THEN** the request is rejected with `400`

### Requirement: Matches for an unknown investor are refused

The system SHALL respond with `404` when matches are requested for an
identifier that matches no stored investor.

#### Scenario: Matches requested for a missing investor

- **WHEN** matches are requested for an identifier that matches no stored investor
- **THEN** the response reports `404` and states which identifier was not found
- **AND** no ranking is performed

### Requirement: Ranking does not scale with application memory

The system SHALL rank and paginate within the datastore, transferring at most
one page of results into the application. Application memory use SHALL NOT grow
with the size of the stored inventory.

#### Scenario: A page is requested from a large inventory

- **WHEN** a single page of matches is requested from an inventory far larger than the page size
- **THEN** only that page of properties is transferred into the application
- **AND** the full inventory is never held in application memory
