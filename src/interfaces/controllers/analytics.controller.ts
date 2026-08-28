import { Controller, Get } from '@nestjs/common';

import { GetTopCitiesUseCase } from '@application/usecases/get-top-cities.usecase';
import type { CityInventory } from '@domain/interfaces/property-repository.interface';
import type { TopCityResponse } from '@interfaces/dtos/top-cities.dto';

const toResponse = (entry: CityInventory): TopCityResponse => ({
  city: entry.city,
  property_count: entry.propertyCount,
  avg_price: entry.averagePrice,

  // `total_inventory` is the COUNT of properties held in the city, not their
  // summed value — design.md Decision 1. The brief never defines the field,
  // but its own example prints it and `property_count` with the same number,
  // and in real-estate usage "inventory" is how many homes are available.
  //
  // So the two fields agree by construction. The duplication is reproduced
  // deliberately rather than corrected, because the response has to match the
  // shape the brief specifies. It is applied HERE and not in the SQL: it is a
  // fact about the wire format, and selecting COUNT(*) twice under two aliases
  // would dress a presentational decision up as an aggregation.
  total_inventory: entry.propertyCount,
});

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly getTopCities: GetTopCitiesUseCase) {}

  /**
   * Returns the array itself — no envelope, exactly as the brief specifies.
   *
   * Nest serialises a returned array as a bare JSON array, so the only way to
   * get this wrong is to add a wrapper on purpose.
   */
  @Get('top-cities')
  async topCities(): Promise<TopCityResponse[]> {
    const cities = await this.getTopCities.execute();
    return cities.map(toResponse);
  }
}
