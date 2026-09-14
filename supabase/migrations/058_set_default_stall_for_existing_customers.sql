-- Migration: Set default stall for existing customer accounts
-- Assigns first active stall of each customer's college to customers who don't have preferred_stall_id set

DO $$
DECLARE
  customer_record RECORD;
  default_stall_id UUID;
BEGIN
  -- Loop through all customers without preferred_stall_id
  FOR customer_record IN
    SELECT id, college_id
    FROM users
    WHERE role = 'customer'
      AND preferred_stall_id IS NULL
      AND college_id IS NOT NULL
  LOOP
    -- Get the first active stall for this customer's college
    SELECT id INTO default_stall_id
    FROM stalls
    WHERE college_id = customer_record.college_id
      AND is_active = true
    ORDER BY created_at ASC  -- First created stall = default
    LIMIT 1;

    -- If a stall was found, update the customer
    IF default_stall_id IS NOT NULL THEN
      UPDATE users
      SET preferred_stall_id = default_stall_id
      WHERE id = customer_record.id;

      RAISE NOTICE 'Set default stall % for customer %', default_stall_id, customer_record.id;
    ELSE
      RAISE WARNING 'No active stall found for customer % at college %',
        customer_record.id, customer_record.college_id;
    END IF;
  END LOOP;
END $$;
