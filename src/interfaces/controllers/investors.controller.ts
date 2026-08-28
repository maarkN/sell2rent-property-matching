import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { CreateInvestorUseCase } from '@application/usecases/create-investor.usecase';
import { GetInvestorUseCase } from '@application/usecases/get-investor.usecase';
import { GetInvestorMatchesUseCase } from '@application/usecases/get-investor-matches.usecase';
import type { RankedProperty } from '@domain/interfaces/property-repository.interface';
import type { Investor } from '@domain/entities/investor.entity';
import {
  CreateInvestorSchema,
  type CreateInvestorDto,
  type InvestorResponse,
} from '@interfaces/dtos/create-investor.dto';
import {
  MatchesQuerySchema,
  SCORE_DECIMALS,
  type MatchResponse,
  type MatchesQueryDto,
  type MatchesResponse,
} from '@interfaces/dtos/matches.dto';
import { ZodValidationPipe } from '@interfaces/pipes/zod-validation.pipe';

const toResponse = (investor: Investor): InvestorResponse => ({
  id: investor.id,
  name: investor.name,
  min_price: investor.minPrice,
  max_price: investor.maxPrice,
  preferred_city: investor.preferredCity,
  min_bedrooms: investor.minBedrooms,
  min_square_feet: investor.minSquareFeet,
});

/**
 * Rounding happens HERE and nowhere earlier.
 *
 * The score is ordered at full precision inside the query; this is the only
 * point at which it becomes a presentational number. Rounding any sooner
 * reorders the results — design.md Decision 3.
 */
const toMatchResponse = ({ property, score }: RankedProperty): MatchResponse => ({
  external_id: property.externalId,
  city: property.city,
  state: property.state,
  price: property.price,
  bedrooms: property.bedrooms,
  bathrooms: property.bathrooms,
  square_feet: property.squareFeet,
  lot_size: property.lotSize,
  score: Number(score.toFixed(SCORE_DECIMALS)),
});

@Controller('investors')
export class InvestorsController {
  constructor(
    private readonly createInvestor: CreateInvestorUseCase,
    private readonly getInvestor: GetInvestorUseCase,
    private readonly getInvestorMatches: GetInvestorMatchesUseCase,
  ) {}

  /** Shared by both routes: a malformed id is a bad request, not a 404. */
  private static parseId(id: string): number {
    const parsed = Number(id);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException(`Invalid investor id: ${id}`);
    }
    return parsed;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateInvestorSchema)) body: CreateInvestorDto,
  ): Promise<InvestorResponse> {
    return toResponse(await this.createInvestor.execute(body));
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<InvestorResponse> {
    // A malformed identifier is a bad REQUEST, not a missing resource.
    // Collapsing both into 404 would hide client bugs.
    return toResponse(await this.getInvestor.execute(InvestorsController.parseId(id)));
  }

  /**
   * Ranks the whole inventory for this investor, best fit first.
   *
   * Nothing is filtered out: a property failing every criterion still appears,
   * last. The scoring criteria are ranking weights, not requirements — see
   * design.md Decision 1.
   */
  @Get(':id/matches')
  async matches(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(MatchesQuerySchema)) query: MatchesQueryDto,
  ): Promise<MatchesResponse> {
    const page = await this.getInvestorMatches.execute(InvestorsController.parseId(id), {
      page: query.page,
      pageSize: query.page_size,
    });

    return {
      data: page.items.map(toMatchResponse),
      meta: { page: query.page, page_size: query.page_size, total: page.total },
    };
  }
}
