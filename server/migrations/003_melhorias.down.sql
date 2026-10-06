-- Rollback of 003_melhorias.sql (run by hand). The points raised to the new thresholds stay raised.
ALTER TABLE player_profile DROP COLUMN IF EXISTS loadout;
DELETE FROM weapon_progress WHERE weapon IN ('pistola', 'smg');
ALTER TABLE weapon_progress DROP CONSTRAINT IF EXISTS weapon_progress_weapon_check;
ALTER TABLE weapon_progress ADD CONSTRAINT weapon_progress_weapon_check CHECK (weapon IN ('rifle', 'faca', 'granada'));
DELETE FROM schema_migrations WHERE name = '003_melhorias.sql';
