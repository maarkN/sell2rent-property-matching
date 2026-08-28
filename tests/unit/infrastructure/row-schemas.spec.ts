import {
  CountRowSchema,
  PropertyRowSchema,
  parseRows,
} from '@infrastructure/repositories/row-schemas';

describe('database row schemas', () => {
  it('converts a NUMERIC column arriving from pg as text into a number', () => {
    // `pg` returns NUMERIC as a string because the type is arbitrary-precision
    // and a float would lose data. Declaring `price: number` and believing the
    // compiler is how you end up concatenating instead of adding.
    const [row] = parseRows(PropertyRowSchema, [
      {
        external_id: 'P0001',
        city: 'Tampa',
        state: 'FL',
        price: '443814.00',
        bedrooms: 3,
        bathrooms: 3,
        square_feet: 2994,
        lot_size: 6893,
      },
    ]);

    expect(row?.price).toBe(443814);
    expect(typeof row?.price).toBe('number');
  });

  it('converts a BIGINT count arriving as text into an integer', () => {
    const [row] = parseRows(CountRowSchema, [{ count: '410' }]);

    expect(row?.count).toBe(410);
    expect(typeof row?.count).toBe('number');
  });

  it('throws naming the offending row when a column is missing', () => {
    // A malformed DB row is a bug in our own SQL, unlike a malformed feed
    // record — so it fails loudly instead of being collected.
    expect(() => parseRows(CountRowSchema, [{ count: '1' }, {}])).toThrow(/row 1/);
  });
});
