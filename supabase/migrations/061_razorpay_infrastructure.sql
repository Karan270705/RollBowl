-- 1. Add Razorpay columns to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_signature TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_gateway TEXT CHECK (payment_gateway IN ('manual', 'razorpay'));

UPDATE public.orders SET payment_gateway = 'manual' WHERE payment_gateway IS NULL;

-- 2. Add Razorpay columns to subscription_purchase_requests table
ALTER TABLE public.subscription_purchase_requests ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
ALTER TABLE public.subscription_purchase_requests ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
ALTER TABLE public.subscription_purchase_requests ADD COLUMN IF NOT EXISTS razorpay_signature TEXT;
ALTER TABLE public.subscription_purchase_requests ADD COLUMN IF NOT EXISTS payment_gateway TEXT CHECK (payment_gateway IN ('manual', 'razorpay'));

UPDATE public.subscription_purchase_requests SET payment_gateway = 'manual' WHERE payment_gateway IS NULL;

-- 3. Update payment_records table constraint
ALTER TABLE public.payment_records DROP CONSTRAINT IF EXISTS payment_records_method_check;
ALTER TABLE public.payment_records ADD CONSTRAINT payment_records_method_check
  CHECK (method IN ('upi', 'cash', 'razorpay'));

-- 4. Create a new audit table for Razorpay events
CREATE TABLE IF NOT EXISTS public.razorpay_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for quick lookup
CREATE INDEX IF NOT EXISTS idx_razorpay_events_order_id ON public.razorpay_events(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_razorpay_events_payment_id ON public.razorpay_events(razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_razorpay_events_processed ON public.razorpay_events(processed) WHERE NOT processed;

-- 5. Add RLS policies for the new table
ALTER TABLE public.razorpay_events ENABLE ROW LEVEL SECURITY;

-- Only service role can access (Edge Functions)
CREATE POLICY "Service role can manage razorpay_events"
  ON public.razorpay_events
  FOR ALL
  USING (auth.role() = 'service_role');
