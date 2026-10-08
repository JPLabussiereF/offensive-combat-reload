-- Rollback of 007_pets.sql (run by hand). Every account's pet, switches and pet names are lost.
ALTER TABLE player_profile DROP COLUMN IF EXISTS pet;
DELETE FROM schema_migrations WHERE name = '007_pets.sql';
