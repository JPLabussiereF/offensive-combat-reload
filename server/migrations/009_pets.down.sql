-- Rollback of 009_pets.sql (run by hand). Every account's pet, switches and pet names are lost.
-- (A database that ran it under its old name, 007_pets.sql, loses that record too.)
ALTER TABLE player_profile DROP COLUMN IF EXISTS pet;
DELETE FROM schema_migrations WHERE name IN ('009_pets.sql', '007_pets.sql');
