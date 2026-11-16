-- A monthly fix profit can now be a fixed euro amount instead of a percentage.
-- NULL = percentage (every existing row); `rate` stays the percentage, or the
-- equivalent percentage at the time a fixed amount was set.
ALTER TABLE "profit_configs" ADD COLUMN "fixedAmount" DOUBLE PRECISION;
