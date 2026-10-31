\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE repair_google_targets AS
SELECT f.id FROM flights f
WHERE f.status='open' AND f.departure_date >= to_char(NOW() AT TIME ZONE 'Europe/Tirane','YYYY-MM-DD')
  AND f.schedule_alert='not_found'
  AND (f.schedule_alert_detail IN (
    'Pa rezultat të besueshëm — nuk është provë anulimi',
    'Kontrolli dështoi — nuk është provë anulimi'
  ) OR f.schedule_alert_detail LIKE '%/5 kontrolle pa çmim%')
  AND NOT EXISTS (
    SELECT 1 FROM settings s WHERE s.key='suspectFlightRecheck.'||f.id
    AND (CASE WHEN s.value IS JSON OBJECT THEN s.value::jsonb ELSE '{}'::jsonb END)->>'missingChecks' ~ '^[5-9][0-9]*$'
  )
FOR UPDATE OF f;
CREATE TEMP TABLE repair_google_backup AS SELECT f.* FROM flights f JOIN repair_google_targets t USING(id);
\copy repair_google_backup TO '/tmp/google-alerts-1.541-flights.csv' WITH CSV HEADER
CREATE TEMP TABLE repair_google_settings_backup AS SELECT s.* FROM settings s JOIN repair_google_targets t ON s.key IN ('suspectFlightRecheck.'||t.id,'stalePriceRetry.'||t.id);
\copy repair_google_settings_backup TO '/tmp/google-alerts-1.541-settings.csv' WITH CSV HEADER
UPDATE flights f SET schedule_alert='price_retry',
  schedule_alert_detail='Në pritje të kontrollit të besueshëm Google — nuk është provë anulimi',
  schedule_miss_count=0
FROM repair_google_targets t WHERE f.id=t.id;
DELETE FROM settings s USING repair_google_targets t
WHERE s.key IN ('suspectFlightRecheck.'||t.id,'stalePriceRetry.'||t.id);
SELECT count(*) AS repaired FROM repair_google_targets;
COMMIT;
