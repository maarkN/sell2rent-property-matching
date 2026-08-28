import { Investor } from '@domain/entities/investor.entity';

const base = {
  name: 'Jane Doe',
  minPrice: 150000,
  maxPrice: 300000,
  preferredCity: 'Houston',
  minBedrooms: 3,
  minSquareFeet: 1200,
};

describe('Investor.create', () => {
  it('accepts complete criteria', () => {
    const result = Investor.create(base);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.preferredCity).toBe('Houston');
  });

  it('rejects an inverted price range', () => {
    const result = Investor.create({ ...base, minPrice: 300000, maxPrice: 150000 });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/max_price/);
  });

  it('accepts a zero-width price range', () => {
    // Degenerate but legal, and the matching engine must survive it: the
    // proximity bonus divides by half the range width.
    expect(Investor.create({ ...base, minPrice: 200000, maxPrice: 200000 }).ok).toBe(true);
  });

  it('rejects a blank name', () => {
    expect(Investor.create({ ...base, name: '   ' }).ok).toBe(false);
  });

  it('rejects negative criteria', () => {
    expect(Investor.create({ ...base, minPrice: -1 }).ok).toBe(false);
    expect(Investor.create({ ...base, minBedrooms: -1 }).ok).toBe(false);
    expect(Investor.create({ ...base, minSquareFeet: -1 }).ok).toBe(false);
  });

  it('normalises an absent or blank preferred city to null', () => {
    // "no city preference" must be distinguishable from a city, because the
    // scoring expression treats it differently.
    const blank = Investor.create({ ...base, preferredCity: '  ' });
    const absent = Investor.create({ ...base, preferredCity: null });

    expect(blank.ok && blank.value.preferredCity).toBeNull();
    expect(absent.ok && absent.value.preferredCity).toBeNull();
  });
});
