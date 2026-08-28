import { Result, err, ok } from '@domain/shared/result';

export interface PropertyProps {
  readonly externalId: string;
  readonly city: string;
  readonly state: string;
  readonly price: number;
  readonly bedrooms: number;
  readonly bathrooms: number;
  readonly squareFeet: number;
  readonly lotSize: number;
}

/** Why a feed record was not admitted. Surfaced verbatim in the API response. */
export type RejectionReason = string;

const REQUIRED_NUMBERS = [
  'bedrooms',
  'bathrooms',
  'square_feet',
  'lot_size',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A property, valid by construction.
 *
 * Validation lives here rather than in the service because these are business
 * rules, not transport concerns — which also makes every rejection reason
 * testable without a database.
 */
export class Property {
  private constructor(private readonly props: PropertyProps) {}

  /**
   * Field order here is deliberate, not incidental.
   *
   * Every malformed record in the feed is missing SEVERAL fields as well as
   * demonstrating one interesting defect, so whichever field is checked first
   * wins the reason. Checking `state` before `price` made P0416 — the record
   * the brief itself cites as "negative price" — report "state is missing"
   * instead, which is true and useless.
   *
   * So the order runs from most to least diagnostic: identity, then the
   * locating field, then price and its validity, then the remaining numerics.
   */
  static create(raw: unknown): Result<Property, RejectionReason> {
    if (!isRecord(raw)) return err('record is not an object');
    if (Object.keys(raw).length === 0) return err('record is empty');

    // --- identity ---------------------------------------------------------
    const externalId = raw['external_id'];
    if (externalId === undefined) return err('external_id is missing');
    if (externalId === null) return err('external_id is null');
    if (typeof externalId !== 'string' || externalId.trim() === '') {
      return err('external_id is not a non-empty string');
    }

    // --- city -------------------------------------------------------------
    const city = raw['city'];
    if (city === undefined) return err('city is missing');
    if (city === null) return err('city is null');
    if (typeof city !== 'string') return err('city is not a string');
    if (city.trim() === '') return err('city is blank');

    // --- price, checked before any remaining field ------------------------
    const price = raw['price'];
    if (price === undefined) return err('price is missing');
    if (price === null) return err('price is null');
    if (typeof price !== 'number' || Number.isNaN(price)) {
      return err('price is not a number');
    }
    if (!Number.isFinite(price)) return err('price is not finite');
    if (price < 0) return err('price is negative');
    if (price === 0) return err('price is zero');

    // --- remaining fields -------------------------------------------------
    const state = raw['state'];
    if (state === undefined) return err('state is missing');
    if (state === null) return err('state is null');
    if (typeof state !== 'string' || state.trim().length !== 2) {
      return err('state is not a two-letter code');
    }

    const numbers: Record<string, number> = {};
    for (const field of REQUIRED_NUMBERS) {
      const value = raw[field];
      if (value === undefined) return err(`${field} is missing`);
      if (value === null) return err(`${field} is null`);
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return err(`${field} is not a number`);
      }
      if (!Number.isFinite(value)) return err(`${field} is not finite`);
      numbers[field] = value;
    }

    const bedrooms = numbers['bedrooms'] as number;
    const bathrooms = numbers['bathrooms'] as number;
    const squareFeet = numbers['square_feet'] as number;
    const lotSize = numbers['lot_size'] as number;

    if (bedrooms < 0) return err('bedrooms is negative');
    if (bathrooms < 0) return err('bathrooms is negative');
    if (squareFeet <= 0) return err('square_feet is not positive');
    if (lotSize <= 0) return err('lot_size is not positive');

    return ok(
      new Property({
        externalId: externalId.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
        price,
        bedrooms,
        bathrooms,
        squareFeet,
        lotSize,
      }),
    );
  }

  /** Rehydrate a row already proven valid by the database's constraints. */
  static fromProps(props: PropertyProps): Property {
    return new Property(props);
  }

  get externalId(): string { return this.props.externalId; }
  get city(): string { return this.props.city; }
  get state(): string { return this.props.state; }
  get price(): number { return this.props.price; }
  get bedrooms(): number { return this.props.bedrooms; }
  get bathrooms(): number { return this.props.bathrooms; }
  get squareFeet(): number { return this.props.squareFeet; }
  get lotSize(): number { return this.props.lotSize; }

  toJSON(): PropertyProps { return { ...this.props }; }
}
