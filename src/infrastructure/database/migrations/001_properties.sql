-- Properties ingested from the MLS feed.
--
-- Every scoring-relevant column is NOT NULL on purpose. In the matching query
-- `NULL >= 3` evaluates to NULL rather than false, and `40 + NULL` is NULL, so
-- one nullable column would erase a row's ENTIRE score instead of costing it
-- points. Every malformed record in the feed is already missing these columns,
-- so requiring them costs no valid data.
CREATE TABLE IF NOT EXISTS properties (
    id           SERIAL PRIMARY KEY,
    external_id  TEXT           NOT NULL UNIQUE,
    city         TEXT           NOT NULL,
    state        CHAR(2)        NOT NULL,
    price        NUMERIC(12, 2) NOT NULL,
    bedrooms     SMALLINT       NOT NULL,
    bathrooms    SMALLINT       NOT NULL,
    square_feet  INTEGER        NOT NULL,
    lot_size     INTEGER        NOT NULL,
    created_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),

    -- Defence in depth. Application validation rejects a negative price; these
    -- guarantee no other write path can introduce one.
    CONSTRAINT properties_price_positive       CHECK (price > 0),
    CONSTRAINT properties_bedrooms_valid       CHECK (bedrooms >= 0),
    CONSTRAINT properties_bathrooms_valid      CHECK (bathrooms >= 0),
    CONSTRAINT properties_square_feet_positive CHECK (square_feet > 0),
    CONSTRAINT properties_lot_size_positive    CHECK (lot_size > 0),
    CONSTRAINT properties_city_not_blank       CHECK (length(trim(city)) > 0)
);

-- Serves the per-city analytics aggregation. Including price makes an
-- index-only scan possible for the per-city average at scale.
CREATE INDEX IF NOT EXISTS properties_city_price_idx ON properties (city, price);

-- NOTE on the matching query: no index can serve it. It evaluates a CASE
-- expression over every row and orders by a computed column, so it is a full
-- scan followed by a sort by construction. At 410 rows the planner scans
-- sequentially regardless; the index above expresses intent at a scale this
-- dataset does not reach. Scaling matching means a materialised score or a
-- pre-filter, not an index.
