import { Property } from '@domain/entities/property.entity';

const valid = () => ({"external_id":"P0001","city":"Tampa","state":"FL","price":443814,"bedrooms":3,"bathrooms":3,"square_feet":2994,"lot_size":6893});

describe('Property.create', () => {
  it('accepts a well-formed record', () => {
    const result = Property.create(valid());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.externalId).toBe('P0001');
      expect(result.value.price).toBe(443814);
    }
  });

  /**
   * One case per malformed shape actually present in data/properties.json.
   * These are the ten records the feed plants deliberately.
   */
  describe.each([
    ['missing price',        { external_id: 'P0411', city: 'Houston' },                              /price is missing/],
    ['price as text',        { external_id: 'P0412', city: 'Dallas', price: 'three hundred thousand' }, /price is not a number/],
    ['null external_id',     { external_id: null, city: 'Austin', price: 250000 },                   /external_id is null/],
    ['absent external_id',   { city: 'Tampa', price: 190000 },                                       /external_id is missing/],
    ['missing city',         { external_id: 'P0415', price: 210000 },                                /city is missing/],
    ['negative price',       { external_id: 'P0416', city: 'Orlando', price: -150000 },              /price is negative/],
    ['zero price',           { external_id: 'P0417', city: 'Houston', state: 'TX', price: 0 },       /price is zero/],
    ['city as a number',     { external_id: 'P0418', city: 123, price: 220000 },                     /city is not a string/],
    ['null price',           { external_id: 'P0419', city: 'Dallas', price: null },                  /price is null/],
    ['empty object',         {},                                                                     /record is empty/],
  ])('rejects %s', (_label, record, expected) => {
    it('with a reason naming the problem', () => {
      const result = Property.create(record);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(expected);
    });
  });

  it('gives each malformed shape a DISTINCT reason', () => {
    const records: unknown[] = [
      { external_id: 'P0411', city: 'Houston' },
      { external_id: 'P0412', city: 'Dallas', price: 'three hundred thousand' },
      { external_id: null, city: 'Austin', price: 250000 },
      { city: 'Tampa', price: 190000 },
      { external_id: 'P0415', price: 210000 },
      { external_id: 'P0416', city: 'Orlando', price: -150000 },
      { external_id: 'P0417', city: 'Houston', state: 'TX', price: 0 },
      { external_id: 'P0418', city: 123, price: 220000 },
      { external_id: 'P0419', city: 'Dallas', price: null },
      {},
    ];

    const reasons = records.map((record) => {
      const result = Property.create(record);
      return result.ok ? 'ACCEPTED' : result.error;
    });

    expect(reasons).not.toContain('ACCEPTED');
    // A single catch-all reason would pass the cases above while telling the
    // caller nothing. Distinctness is the actual requirement.
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  it('rejects a non-object record', () => {
    expect(Property.create(null).ok).toBe(false);
    expect(Property.create('P0001').ok).toBe(false);
    expect(Property.create([]).ok).toBe(false);
  });

  it('normalises whitespace and state casing', () => {
    const result = Property.create({ ...valid(), city: '  Tampa  ', state: 'fl' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.city).toBe('Tampa');
      expect(result.value.state).toBe('FL');
    }
  });
});
