import { Inject, Injectable } from '@nestjs/common';

import type { CityInventory } from '@domain/interfaces/property-repository.interface';
import {
  PROPERTY_REPOSITORY,
  type PropertyRepository,
} from '@domain/interfaces/property-repository.interface';

/**
 * Per-city inventory analytics.
 *
 * Thin on purpose. There is no orchestration to do — the aggregation is a
 * single statement and the brief asks for no filtering, parameterisation or
 * time-slicing — but the layer stays in place so the controller depends on a
 * use case rather than reaching for a repository token itself. That is the
 * seam a threshold, a date range or a cache would be added at, and skipping it
 * here would mean rewriting the controller to add the first one.
 */
@Injectable()
export class GetTopCitiesUseCase {
  constructor(
    @Inject(PROPERTY_REPOSITORY) private readonly properties: PropertyRepository,
  ) {}

  async execute(): Promise<CityInventory[]> {
    return this.properties.cityInventory();
  }
}
