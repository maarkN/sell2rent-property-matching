import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';

import { CreateInvestorUseCase } from '@application/usecases/create-investor.usecase';
import { GetInvestorUseCase } from '@application/usecases/get-investor.usecase';
import type { Investor } from '@domain/entities/investor.entity';
import {
  CreateInvestorSchema,
  type CreateInvestorDto,
  type InvestorResponse,
} from '@interfaces/dtos/create-investor.dto';
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

@Controller('investors')
export class InvestorsController {
  constructor(
    private readonly createInvestor: CreateInvestorUseCase,
    private readonly getInvestor: GetInvestorUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateInvestorSchema)) body: CreateInvestorDto,
  ): Promise<InvestorResponse> {
    return toResponse(await this.createInvestor.execute(body));
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<InvestorResponse> {
    const parsed = Number(id);

    // A malformed identifier is a bad REQUEST, not a missing resource.
    // Collapsing both into 404 would hide client bugs.
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException(`Invalid investor id: ${id}`);
    }

    return toResponse(await this.getInvestor.execute(parsed));
  }
}
