import type { Investor, NewInvestorProps } from '@domain/entities/investor.entity';

export const INVESTOR_REPOSITORY = Symbol('INVESTOR_REPOSITORY');

export interface InvestorRepository {
  create(props: NewInvestorProps): Promise<Investor>;
  findById(id: number): Promise<Investor | null>;
}
