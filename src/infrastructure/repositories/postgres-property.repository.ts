import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import type { Property } from '@domain/entities/property.entity';
import type { PropertyRepository } from '@domain/interfaces/property-repository.interface';
import { DATABASE_POOL } from '@infrastructure/database/pool';
import { CountRowSchema, parseRows } from '@infrastructure/repositories/row-schemas';

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
}
