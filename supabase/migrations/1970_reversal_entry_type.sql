-- 1970: new ledger entry type for a payment the provider took back (reversal, chargeback). See ADR-015.
-- Kept in its own file because a new enum value cannot be used in the transaction that adds it.
-- The next migration (1971) uses it.

alter type ledger_entry_type add value if not exists 'payment_reversal_debit';
