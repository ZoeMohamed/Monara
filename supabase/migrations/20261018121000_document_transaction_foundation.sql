-- Keep the ledger invariants visible to operators inspecting the production schema.
comment on column public.transactions.flow_direction is
  'Cash direction: expense is out, income is in, and exclusions retain their observed in/out direction when known.';

comment on column public.transactions.occurred_on is
  'Required transaction calendar date; ingestion falls back to the source timestamp in Asia/Jakarta when the source omits one.';
