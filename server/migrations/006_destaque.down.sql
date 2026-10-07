-- Rollback of 006_destaque.sql (run by hand). The showcase choices are lost; the album itself stays.
ALTER TABLE player_profile DROP COLUMN IF EXISTS featured_sticker;
ALTER TABLE player_profile DROP COLUMN IF EXISTS title;
DELETE FROM schema_migrations WHERE name = '006_destaque.sql';
