import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  INVESTOR_REPOSITORY,
  type InvestorRepository,
} from '@domain/interfaces/investor-repository.interface';
import {
  PROPERTY_REPOSITORY,
  type Pagination,
  type PropertyRepository,
  type RankedPage,
} from '@domain/interfaces/property-repository.interface';

@Injectable()
export class GetInvestorMatchesUseCase {
  constructor(
    @Inject(INVESTOR_REPOSITORY) private readonly investors: InvestorRepository,
    @Inject(PROPERTY_REPOSITORY) private readonly properties: PropertyRepository,
  ) {}

  async execute(investorId: number, page: Pagination): Promise<RankedPage> {
    const investor = await this.investors.findById(investorId);

    // Existence is asserted BEFORE ranking, not after. Ranking scans and sorts
    // the whole inventory; running it for an identifier that turns out not to
    // exist spends that work to produce a 404. The message names the
    // identifier, matching how a direct fetch reports the same failure.
    if (investor === null) {
      throw new NotFoundException(`Investor with id ${investorId} not found`);
    }

    return this.properties.rankByFit(
      {
        preferredCity: investor.preferredCity,
        minPrice: investor.minPrice,
        maxPrice: investor.maxPrice,
        minBedrooms: investor.minBedrooms,
        minSquareFeet: investor.minSquareFeet,
      },
      page,
    );
  }
}
