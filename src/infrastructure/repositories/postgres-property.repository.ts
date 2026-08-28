import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import type { Property } from '@domain/entities/property.entity';
import type {
  CityInventory,
  PropertyRepository,
} from '@domain/interfaces/property-repository.interface';
import { DATABASE_POOL } from '@infrastructure/database/pool';
import {
  CityInventoryRowSchema,
  CountRowSchema,
  parseRows,
} from '@infrastructure/repositories/row-schemas';

const COLUMNS = 8;

@Injectable()
export class PostgresPropertyRepository implements PropertyRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async insertIgnoringDuplicates(properties: readonly Property[]): Promise<number> {
    if (properties.length === 0) return 0;

    // Build one multi-row INSERT rather than a statement per property: 410
    // round trips would dominate the cost of the whole endpoint.
    const values: unknown[] = [];
    const tuples = properties.map((property, index) => {
      const base = index * COLUMNS;
      values.push(
        property.externalId,
        property.city,
        property.state,
        property.price,
        property.bedrooms,
        property.bathrooms,
        property.squareFeet,
        property.lotSize,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
    });

    // ON CONFLICT DO NOTHING is the whole idempotency mechanism. Checking which
    // identifiers already exist and filtering in application code would be both
    // an extra round trip and a race.
    const { rowCount } = await this.pool.query(
      `INSERT INTO properties
         (external_id, city, state, price, bedrooms, bathrooms, square_feet, lot_size)
       VALUES ${tuples.join(', ')}
       ON CONFLICT (external_id) DO NOTHING`,
      values,
    );

    return rowCount ?? 0;
  }

  async count(): Promise<number> {
    const { rows } = await this.pool.query('SELECT COUNT(*)::text AS count FROM properties');
    const [parsed] = parseRows(CountRowSchema, rows);
    return parsed?.count ?? 0;
  }

  async cityInventory(): Promise<CityInventory[]> {
    // GROUP BY does the work, so the result set is one row per city no matter
    // how large the inventory grows. Reading the properties and reducing them
    // in JavaScript would produce the same numbers while transferring every
    // row — the difference the brief cares about is here, not in the output.
    //
    // ROUND to two decimals matches the NUMERIC(12, 2) the prices are stored
    // at; see design.md Decision 2. Rounding in SQL rather than on the way out
    // keeps the reported figure and the compared figure identical.
    //
    // ORDER BY count alone, as the brief specifies. This ordering is PARTIAL:
    // Fort Worth and Austin both hold 54 properties, Dallas and Tampa both 50,
    // and nothing here decides which of a tied pair comes first. Recorded in
    // design.md Decision 3 rather than silently fixed.
    //
    // properties_city_price_idx (city, price) covers this: the one query in
    // the service an index can actually serve.
    const { rows } = await this.pool.query(
      `SELECT city,
              COUNT(*)             AS property_count,
              ROUND(AVG(price), 2) AS average_price
         FROM properties
        GROUP BY city
        ORDER BY COUNT(*) DESC`,
    );

    // COUNT(*) is BIGINT and the rounded average is NUMERIC; both arrive as
    // strings, and the schema is what turns them back into numbers.
    return parseRows(CityInventoryRowSchema, rows).map((row) => ({
      city: row.city,
      propertyCount: row.property_count,
      averagePrice: row.average_price,
    }));
  }
}
