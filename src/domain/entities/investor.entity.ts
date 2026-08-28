import { Result, err, ok } from '@domain/shared/result';

export interface InvestorProps {
  readonly id: number;
  readonly name: string;
  readonly minPrice: number;
  readonly maxPrice: number;
  readonly preferredCity: string | null;
  readonly minBedrooms: number;
  readonly minSquareFeet: number;
}

export type NewInvestorProps = Omit<InvestorProps, 'id'>;

export class Investor {
  private constructor(private readonly props: InvestorProps) {}

  /**
   * Enforces the invariants that make an investor usable by the matching
   * engine. Transport-level shape is checked earlier by the request schema;
   * what remains here is the rule that spans fields.
   */
  static create(props: NewInvestorProps): Result<Investor, string> {
    if (props.name.trim() === '') return err('name must not be blank');
    if (props.minPrice < 0) return err('min_price must not be negative');
    if (props.maxPrice < props.minPrice) {
      return err('max_price must be greater than or equal to min_price');
    }
    if (props.minBedrooms < 0) return err('min_bedrooms must not be negative');
    if (props.minSquareFeet < 0) return err('min_square_feet must not be negative');

    const city = props.preferredCity?.trim();

    return ok(
      new Investor({
        ...props,
        id: 0,
        name: props.name.trim(),
        preferredCity: city === undefined || city === '' ? null : city,
      }),
    );
  }

  /** Rehydrate a row the database's constraints already proved valid. */
  static fromProps(props: InvestorProps): Investor {
    return new Investor(props);
  }

  get id(): number { return this.props.id; }
  get name(): string { return this.props.name; }
  get minPrice(): number { return this.props.minPrice; }
  get maxPrice(): number { return this.props.maxPrice; }
  get preferredCity(): string | null { return this.props.preferredCity; }
  get minBedrooms(): number { return this.props.minBedrooms; }
  get minSquareFeet(): number { return this.props.minSquareFeet; }

  toJSON(): InvestorProps { return { ...this.props }; }
}
