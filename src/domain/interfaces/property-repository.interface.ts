import type { Property } from '@domain/entities/property.entity';

/**
 * DI token.
 *
 * A Symbol rather than a string: a string token is a name with no definition,
 * and registering the same string twice silently replaces the first binding.
 */
export const PROPERTY_REPOSITORY = Symbol('PROPERTY_REPOSITORY');

/**
 * One city's slice of stored inventory.
 *
 * A read model, not an entity: it has no identity, no lifecycle and no rules of
 * its own, so it lives beside the contract that produces it rather than in
 * `entities/`. It carries the count and the average only — `total_inventory` is
 * the same count under a second name, which is a fact about the response shape
 * and is applied at that boundary.
 */
export interface CityInventory {
  readonly city: string;
  readonly propertyCount: number;
  readonly averagePrice: number;
}

/**
 * The buying criteria a property is scored against.
 *
 * Mirrors the investor's criteria rather than taking the entity itself, so the
 * contract says exactly what ranking reads and nothing else. `preferredCity` is
 * the only nullable one, because "no preference" differs from any city.
 */
export interface MatchCriteria {
  readonly preferredCity: string | null;
  readonly minPrice: number;
  readonly maxPrice: number;
  readonly minBedrooms: number;
  readonly minSquareFeet: number;
}

export interface Pagination {
  readonly page: number;
  readonly pageSize: number;
}

/** A property and the fit score it earned, at full precision. */
export interface RankedProperty {
  readonly property: Property;
  readonly score: number;
}

/**
 * One page of ranked properties, with the size of the whole result set.
 *
 * `total` is carried alongside the page because a caller cannot otherwise tell
 * a last page from a page past the end — and it must survive the second case,
 * where `items` is empty.
 */
export interface RankedPage {
  readonly items: readonly RankedProperty[];
  readonly total: number;
}

export interface PropertyRepository {
  /**
   * Insert properties, ignoring any whose external identifier already exists.
   *
   * @returns how many rows were actually inserted — which is what makes a
   *          repeated import observably a no-op rather than merely harmless.
   */
  insertIgnoringDuplicates(properties: readonly Property[]): Promise<number>;

  count(): Promise<number>;

  /**
   * Per-city property count and average price, ranked by count descending.
   *
   * Declared to return one row per city rather than a list of properties,
   * because that is the whole point: the aggregation happens in the datastore
   * and only the aggregate crosses this boundary. A contract returning
   * `Property[]` would permit an implementation that loads the inventory and
   * reduces it in application code.
   *
   * Ordering is partial — cities with equal counts have no guaranteed relative
   * position. See design.md Decision 3.
   */
  cityInventory(): Promise<CityInventory[]>;

  /**
   * Score every stored property against the criteria and return one page in
   * rank order, best fit first.
   *
   * Ranks, it does not filter: the result set is the entire inventory for any
   * criteria, so `total` never depends on how well anything matched. Scoring,
   * ordering and pagination all happen in the datastore — only the page
   * crosses this boundary.
   *
   * Scores come back at full precision. Rounding is the caller's business, and
   * deliberately so: rounding before ordering silently reorders the result.
   */
  rankByFit(criteria: MatchCriteria, page: Pagination): Promise<RankedPage>;
}
