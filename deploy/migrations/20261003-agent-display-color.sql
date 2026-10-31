-- Run before deploying the API bundle that reads agents.display_color.
-- Nullable and without a default: existing agency appearance stays unchanged.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS display_color text;