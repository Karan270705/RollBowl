-- ============================================================
-- SQL Queries for Read-Only Storage Report
-- ============================================================

-- 1. Summary of Retained Screenshots (Active in Storage)
SELECT 
  COUNT(*) AS retained_count,
  COALESCE(SUM(screenshot_size_bytes), 0) AS retained_bytes,
  ROUND(COALESCE(SUM(screenshot_size_bytes), 0) / (1024.0 * 1024.0), 2) AS retained_mb
FROM payment_proofs
WHERE screenshot_path IS NOT NULL
  AND screenshot_deleted_at IS NULL;

-- 2. Screenshot Count and Size Breakdown by Proof Status
SELECT 
  status AS proof_status,
  COUNT(*) AS retained_count,
  COALESCE(SUM(screenshot_size_bytes), 0) AS total_bytes,
  ROUND(COALESCE(SUM(screenshot_size_bytes), 0) / (1024.0 * 1024.0), 2) AS total_mb
FROM payment_proofs
WHERE screenshot_path IS NOT NULL
  AND screenshot_deleted_at IS NULL
GROUP BY status
ORDER BY retained_count DESC;

-- 3. Summary of Screenshots Eligible for Retention Deletion
SELECT 
  COUNT(*) AS eligible_count,
  COALESCE(SUM(p.screenshot_size_bytes), 0) AS eligible_bytes,
  ROUND(COALESCE(SUM(p.screenshot_size_bytes), 0) / (1024.0 * 1024.0), 2) AS eligible_mb
FROM payment_proofs p
JOIN eligible_payment_proofs_cleanup e ON p.id = e.id;

-- 4. Oldest Retained Screenshot currently stored
SELECT 
  id AS proof_id,
  screenshot_path,
  status,
  submitted_at,
  verified_at,
  screenshot_size_bytes,
  ROUND(screenshot_size_bytes / (1024.0 * 1024.0), 2) AS size_mb
FROM payment_proofs
WHERE screenshot_path IS NOT NULL
  AND screenshot_deleted_at IS NULL
ORDER BY submitted_at ASC
LIMIT 1;

-- 5. List of Failed Deletion Attempts (Retention cleanup errors)
SELECT 
  id AS proof_id,
  screenshot_path,
  status,
  screenshot_delete_attempted_at,
  screenshot_delete_error
FROM payment_proofs
WHERE screenshot_delete_error IS NOT NULL
ORDER BY screenshot_delete_attempted_at DESC;
