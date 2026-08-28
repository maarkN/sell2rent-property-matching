import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import { Property } from '@domain/entities/property.entity';
import type {
  CityInventory,
  MatchCriteria,
  Pagination,
  PropertyRepository,
  RankedPage,
} from '@domain/interfaces/property-repository.interface';
import { DATABASE_POOL } from '@infrastructure/database/pool';
import {
  CityInventoryRowSchema,
  CountRowSchema,
  RankedPropertyRowSchema,
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

  async rankByFit(criteria: MatchCriteria, page: Pagination): Promise<RankedPage> {
    // The whole ranking is this one statement. Reading properties and scoring
    // them in JavaScript would give the same numbers while pulling the entire
    // inventory into memory on every request.
    //
    // Four things here are load-bearing:
    //
    // 1. `city = $1` when $1 is NULL yields NULL, not false, so the CASE falls
    //    to ELSE 0 — no city weight, and no NULL leaking into the sum. Adding
    //    NULL to a running total would erase the row's ENTIRE score rather
    //    than costing it 40 points.
    // 2. Every literal in the bonus is cast to numeric before dividing. With
    //    integer operands the division truncates and the bonus degenerates to
    //    0 or 5, never an intermediate value — and the query still returns
    //    plausible-looking scores while doing it.
    // 3. The zero-width branch. An investor whose minimum equals their maximum
    //    gives a half-width of zero; without the branch the request divides by
    //    zero and fails.
    // 4. GREATEST/LEAST clamps to [0, 5]. Unclamped, the 5,000,000 property
    //    scores -313.3 against a 150,000-300,000 range and sorts below rows it
    //    should merely trail.
    //
    // `ORDER BY score DESC` resolves to the output alias — which is safe ONLY
    // because that alias is the unrounded expression. Round in this projection
    // and the ordering silently follows the rounded value: see design.md
    // Decision 3, where doing so puts the worst of three properties first.
    const { rows } = await this.pool.query(
      `SELECT t.total,
              p.external_id, p.city, p.state, p.price,
              p.bedrooms, p.bathrooms, p.square_feet, p.lot_size, p.score
         FROM (SELECT COUNT(*) AS total FROM properties) t
         -- LEFT JOIN LATERAL ... ON TRUE always yields a row, so a page past
         -- the end reports the real total instead of vanishing with it.
         LEFT JOIN LATERAL (
           SELECT external_id, city, state, price,
                  bedrooms, bathrooms, square_feet, lot_size,
                  (CASE WHEN city = $1::text THEN 40 ELSE 0 END)
                + (CASE WHEN price BETWEEN $2::numeric AND $3::numeric THEN 30 ELSE 0 END)
                + (CASE WHEN bedrooms >= $4::int THEN 15 ELSE 0 END)
                + (CASE WHEN square_feet >= $5::int THEN 10 ELSE 0 END)
                + (CASE WHEN $3::numeric = $2::numeric
                        THEN (CASE WHEN price = $2::numeric THEN 5 ELSE 0 END)::numeric
                        ELSE GREATEST(0::numeric, LEAST(5::numeric,
                               5 * (1 - ABS(price - ($2::numeric + $3::numeric) / 2)
                                        / (($3::numeric - $2::numeric) / 2))))
                   END) AS score
             FROM properties
            ORDER BY score DESC, external_id ASC
            LIMIT $6::int OFFSET $7::int
         ) p ON TRUE`,
      [
        criteria.preferredCity,
        criteria.minPrice,
        criteria.maxPrice,
        criteria.minBedrooms,
        criteria.minSquareFeet,
        page.pageSize,
        (page.page - 1) * page.pageSize,
      ],
    );

    const parsed = parseRows(RankedPropertyRowSchema, rows);
    const total = parsed[0]?.total ?? 0;

    return {
      total,
      // The total-only row has no property on it; dropping it here is what
      // turns "past the end" into an empty page rather than a phantom entry.
      items: parsed.flatMap((row) =>
        row.external_id === null || row.score === null
          ? []
          : [
              {
                score: row.score,
                property: Property.fromProps({
                  externalId: row.external_id,
                  city: row.city ?? '',
                  state: row.state ?? '',
                  price: row.price ?? 0,
                  bedrooms: row.bedrooms ?? 0,
                  bathrooms: row.bathrooms ?? 0,
                  squareFeet: row.square_feet ?? 0,
                  lotSize: row.lot_size ?? 0,
                }),
              },
            ],
      ),
    };
  }
}
