-- Investors and the buying criteria matching ranks inventory against.
--
-- Optional numeric criteria default to 0 rather than staying nullable: in the
-- scoring expression `bedrooms >= NULL` is NULL, and adding NULL to a running
-- score erases the whole score. Zero means "no minimum", which is exactly what
-- an absent criterion means, and keeps the comparison total.
--
-- preferred_city is the exception and stays nullable, because "no city
-- preference" is genuinely different from any particular city.
CREATE TABLE IF NOT EXISTS investors (
    id               SERIAL PRIMARY KEY,
    name             TEXT           NOT NULL,
    min_price        NUMERIC(12, 2) NOT NULL,
    max_price        NUMERIC(12, 2) NOT NULL,
    preferred_city   TEXT           NULL,
    min_bedrooms     SMALLINT       NOT NULL DEFAULT 0,
    min_square_feet  INTEGER        NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT investors_name_not_blank    CHECK (length(trim(name)) > 0),
    CONSTRAINT investors_min_price_valid   CHECK (min_price >= 0),
    CONSTRAINT investors_min_bedrooms_valid    CHECK (min_bedrooms >= 0),
    CONSTRAINT investors_min_square_feet_valid CHECK (min_square_feet >= 0),

    -- The invariant the matching query depends on: the proximity bonus divides
    -- by half the range width, and a negative width would invert the bonus.
    CONSTRAINT investors_price_range_ordered CHECK (max_price >= min_price)
);
