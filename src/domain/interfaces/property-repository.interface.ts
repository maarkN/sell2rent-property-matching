import type { Property } from '@domain/entities/property.entity';

/**
 * DI token.
 *
 * A Symbol rather than a string: a string token is a name with no definition,
 * and registering the same string twice silently replaces the first binding.
 */
export const PROPERTY_REPOSITORY = Symbol('PROPERTY_REPOSITORY');

export interface PropertyRepository {
  /**
   * Insert properties, ignoring any whose external identifier already exists.
   *
   * @returns how many rows were actually inserted — which is what makes a
   *          repeated import observably a no-op rather than merely harmless.
   */
  insertIgnoringDuplicates(properties: readonly Property[]): Promise<number>;

  count(): Promise<number>;
}
