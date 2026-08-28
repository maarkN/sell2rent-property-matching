/**
 * One entry of `GET /analytics/top-cities`.
 *
 * There is no request schema beside it: the endpoint takes no body and no
 * parameters, and adding an optional filter is an explicit non-goal of this
 * change.
 *
 * The response body is an ARRAY of these — the array itself, not an object
 * containing it. No envelope can express that shape, which is the reason the
 * no-envelope rule exists.
 */
export interface TopCityResponse {
  readonly city: string;
  readonly property_count: number;
  readonly avg_price: number;
  readonly total_inventory: number;
}
