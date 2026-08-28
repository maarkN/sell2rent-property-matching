import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { Investor } from '@domain/entities/investor.entity';
import {
  INVESTOR_REPOSITORY,
  type InvestorRepository,
} from '@domain/interfaces/investor-repository.interface';

@Injectable()
export class GetInvestorUseCase {
  constructor(
    @Inject(INVESTOR_REPOSITORY) private readonly investors: InvestorRepository,
  ) {}

  async execute(id: number): Promise<Investor> {
    const investor = await this.investors.findById(id);

    if (investor === null) {
      // The message names the identifier, so a caller reading only the error
      // body knows what was not found.
      throw new NotFoundException(`Investor with id ${id} not found`);
    }

    return investor;
  }
}
