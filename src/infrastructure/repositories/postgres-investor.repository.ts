import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import { Investor, type NewInvestorProps } from '@domain/entities/investor.entity';
import type { InvestorRepository } from '@domain/interfaces/investor-repository.interface';
import { DATABASE_POOL } from '@infrastructure/database/pool';
import {
  InvestorRowSchema,
  type InvestorRow,
  parseRows,
} from '@infrastructure/repositories/row-schemas';

@Injectable()
export class PostgresInvestorRepository implements InvestorRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async create(props: NewInvestorProps): Promise<Investor> {
    const { rows } = await this.pool.query(
      `INSERT INTO investors
         (name, min_price, max_price, preferred_city, min_bedrooms, min_square_feet)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, min_price, max_price, preferred_city,
                 min_bedrooms, min_square_feet`,
      [
        props.name,
        props.minPrice,
        props.maxPrice,
        props.preferredCity,
        props.minBedrooms,
        props.minSquareFeet,
      ],
    );

    const [row] = parseRows(InvestorRowSchema, rows);
    if (row === undefined) throw new Error('INSERT ... RETURNING produced no row');
    return PostgresInvestorRepository.toDomain(row);
  }

  async findById(id: number): Promise<Investor | null> {
    const { rows } = await this.pool.query(
      `SELECT id, name, min_price, max_price, preferred_city,
              min_bedrooms, min_square_feet
       FROM investors WHERE id = $1`,
      [id],
    );

    const [row] = parseRows(InvestorRowSchema, rows);
    return row === undefined ? null : PostgresInvestorRepository.toDomain(row);
  }

  private static toDomain(row: InvestorRow): Investor {
    return Investor.fromProps({
      id: row.id,
      name: row.name,
      minPrice: row.min_price,
      maxPrice: row.max_price,
      preferredCity: row.preferred_city,
      minBedrooms: row.min_bedrooms,
      minSquareFeet: row.min_square_feet,
    });
  }
}
