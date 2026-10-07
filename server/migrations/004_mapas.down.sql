-- Rollback of 004_mapas.sql (run by hand). The maps, their versions and the uploaded models' rows go; the GLB
-- files under MAPAS_DIR stay on disk.
ALTER TABLE session_participation DROP COLUMN IF EXISTS map_id;
UPDATE role SET description = 'Aplica e revoga sanções' WHERE name = 'moderador';
ALTER TABLE auth_event DROP COLUMN IF EXISTS actor_id;
DROP TABLE IF EXISTS map_version_asset;
DROP TABLE IF EXISTS map_asset;
ALTER TABLE IF EXISTS map DROP CONSTRAINT IF EXISTS map_current_version_fk;
DROP TABLE IF EXISTS map_version;
DROP FUNCTION IF EXISTS map_version_immutable();
DROP TABLE IF EXISTS map;
-- pg_trgm stays: other objects of the database may use it.
DELETE FROM schema_migrations WHERE name = '004_mapas.sql';
