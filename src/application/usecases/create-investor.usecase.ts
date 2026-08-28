import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { Investor } from '@domain/entities/investor.entity';
import {
  INVESTOR_REPOSITORY,
  type InvestorRepository,
} from '@domain/interfaces/investor-repository.interface';
import type { CreateInvestorDto } from '@interfaces/dtos/create-investor.dto';

@Injectable()
export class CreateInvestorUseCase {
  constructor(
    @Inject(INVESTOR_REPOSITORY) private readonly investors: InvestorRepository,
  ) {}

  async execute(dto: CreateInvestorDto): Promise<Investor> {
    // The request schema already checked shape; the entity checks the rules
    // that are true of an investor regardless of how it arrived.
    const candidate = Investor.create({
      name: dto.name,
      minPrice: dto.min_price,
      maxPrice: dto.max_price,
      preferredCity: dto.preferred_city ?? null,
      minBedrooms: dto.min_bedrooms,
      minSquareFeet: dto.min_square_feet,
    });

    if (!candidate.ok) throw new BadRequestException(candidate.error);

    return this.investors.create({
      name: candidate.value.name,
      minPrice: candidate.value.minPrice,
      maxPrice: candidate.value.maxPrice,
      preferredCity: candidate.value.preferredCity,
      minBedrooms: candidate.value.minBedrooms,
      minSquareFeet: candidate.value.minSquareFeet,
    });
  }
}
