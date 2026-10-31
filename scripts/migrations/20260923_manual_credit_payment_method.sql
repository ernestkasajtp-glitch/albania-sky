ALTER TABLE agent_credit_transactions
ADD COLUMN IF NOT EXISTS payment_method text;