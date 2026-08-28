## Purpose

Reports aggregate figures over the stored property inventory, so that inventory
distribution and pricing can be understood per market without inspecting
individual listings.

## ADDED Requirements

### Requirement: Inventory is reported per city

The system SHALL report, for each city present in stored inventory, the number
of properties in that city, the average price of those properties, and the
total inventory held there. Cities SHALL be ranked by property count in
descending order.

Total inventory SHALL be the count of properties held in that city, matching
the property count. Two readings of "total inventory" are available — a count
of listings, or the summed value of those listings — and the count is the
normative one here: the brief's own example reports both fields with the same
value, and in real-estate usage "inventory" denotes the number of homes
available rather than their aggregate price. The redundancy is deliberate and
preserved so the response matches the specified shape.

#### Scenario: Inventory spans several cities

- **WHEN** per-city analytics are requested over an inventory spanning several cities
- **THEN** each city appears exactly once
- **AND** each entry reports that city's property count, average price, and total inventory
- **AND** the entries are ordered from the highest property count to the lowest

#### Scenario: A city holds a single property

- **WHEN** a city holds exactly one property
- **THEN** it appears with a count of one and an average price equal to that property's price
- **AND** its total inventory is one

#### Scenario: Total inventory is compared against property count

- **WHEN** per-city analytics are requested
- **THEN** every entry's total inventory equals that entry's property count

#### Scenario: Storage holds no properties

- **WHEN** per-city analytics are requested before any property has been imported
- **THEN** an empty result is returned with `200` rather than an error

### Requirement: Reported figures reflect only stored properties

The system SHALL derive every reported figure from stored properties alone.
Records rejected during import SHALL NOT contribute to any count, average, or
total.

#### Scenario: A feed containing rejected records has been imported

- **WHEN** per-city analytics are requested after importing a feed whose records were partly rejected
- **THEN** the summed property count across all cities equals the number of stored properties
- **AND** no city's figures reflect a rejected record

#### Scenario: Outlying prices are present

- **WHEN** a city holds properties whose prices differ by two orders of magnitude
- **THEN** the reported average reflects every stored property in that city, including the outliers

### Requirement: The response reports figures at a stated precision

The system SHALL report the average price as a number at a documented, fixed
precision, so that a consumer can compare values across cities without knowing
how the figure was derived.

#### Scenario: An average does not divide evenly

- **WHEN** a city's prices produce a non-terminating average
- **THEN** the reported average is a number at the documented precision
- **AND** it is not reported as text

### Requirement: Aggregation does not scale with application memory

The system SHALL compute aggregates within the datastore, transferring only the
aggregated result. Application memory use SHALL NOT grow with the size of the
stored inventory.

#### Scenario: Analytics are requested over a large inventory

- **WHEN** per-city analytics are requested over an inventory far larger than the number of cities
- **THEN** only one row per city is transferred into the application
- **AND** individual property records are never held in application memory
