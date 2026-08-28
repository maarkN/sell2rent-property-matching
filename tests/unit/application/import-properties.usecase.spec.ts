import { ImportPropertiesUseCase } from '@application/usecases/import-properties.usecase';
import type {
  CityInventory,
  PropertyRepository,
} from '@domain/interfaces/property-repository.interface';
import type { Property } from '@domain/entities/property.entity';
import { ConfigService } from '@shared/config/config.service';
import { Logger } from '@shared/utils/logger';

class InMemoryPropertyRepository implements PropertyRepository {
  public readonly saved: Property[] = [];

  async insertIgnoringDuplicates(properties: readonly Property[]): Promise<number> {
    const fresh = properties.filter(
      (p) => !this.saved.some((s) => s.externalId === p.externalId),
    );
    this.saved.push(...fresh);
    return fresh.length;
  }

  async count(): Promise<number> {
    return this.saved.length;
  }

  /**
   * Part of the contract, unused by import.
   *
   * Implemented rather than stubbed with `throw`: a fake that lies about a
   * method is worse than one that does not have it, and the compiler is the
   * reason the omission was noticed at all.
   */
  async cityInventory(): Promise<CityInventory[]> {
    const byCity = new Map<string, number[]>();
    for (const property of this.saved) {
      byCity.set(property.city, [...(byCity.get(property.city) ?? []), property.price]);
    }

    return [...byCity.entries()]
      .map(([city, prices]) => ({
        city,
        propertyCount: prices.length,
        averagePrice:
          Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100,
      }))
      .sort((left, right) => right.propertyCount - left.propertyCount);
  }
}

const makeUseCase = () => {
  const repository = new InMemoryPropertyRepository();
  const config = new ConfigService({
    DATABASE_URL: 'postgresql://localhost:5432/x',
    NODE_ENV: 'test',
  });
  return { repository, useCase: new ImportPropertiesUseCase(repository, config, new Logger()) };
};

const valid = (id: string) => ({ ...({"external_id":"P0001","city":"Tampa","state":"FL","price":443814,"bedrooms":3,"bathrooms":3,"square_feet":2994,"lot_size":6893}), external_id: id });

describe('ImportPropertiesUseCase', () => {
  it('reports imported and skipped counts', async () => {
    const { useCase } = makeUseCase();

    const result = await useCase.importRecords([valid('P1'), {}, valid('P2')]);

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
  });

  it('does not let a malformed record abort the batch', async () => {
    const { repository, useCase } = makeUseCase();

    // The malformed record comes FIRST — fail-fast would lose everything after it.
    await useCase.importRecords([
      { external_id: 'P0412', city: 'Dallas', price: 'three hundred thousand' },
      valid('P1'),
      valid('P2'),
      valid('P3'),
    ]);

    expect(repository.saved.map((p) => p.externalId)).toEqual(['P1', 'P2', 'P3']);
  });

  it('reports a position for records with no usable identifier', async () => {
    const { useCase } = makeUseCase();

    const result = await useCase.importRecords([
      valid('P1'),
      { external_id: null, city: 'Austin', price: 250000 },
      { city: 'Tampa', price: 190000 },
      {},
    ]);

    expect(result.errors).toEqual([
      { external_id: null, index: 1, reason: expect.stringMatching(/external_id is null/) },
      { external_id: null, index: 2, reason: expect.stringMatching(/external_id is missing/) },
      { external_id: null, index: 3, reason: expect.stringMatching(/record is empty/) },
    ]);
  });

  it('keeps the identifier on rejections that have one', async () => {
    const { useCase } = makeUseCase();

    const result = await useCase.importRecords([
      { external_id: 'P0416', city: 'Orlando', state: 'FL', price: -150000 },
    ]);

    expect(result.errors[0]).toMatchObject({ external_id: 'P0416', index: 0 });
  });

  it('is idempotent across repeated runs', async () => {
    const { repository, useCase } = makeUseCase();
    const batch = [valid('P1'), valid('P2')];

    const first = await useCase.importRecords(batch);
    const second = await useCase.importRecords(batch);

    expect(first.imported).toBe(2);
    expect(second.imported).toBe(0);
    expect(await repository.count()).toBe(2);
  });
});
