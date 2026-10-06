-- Rollback of 005_figurinhas.sql (run by hand). The stickers' own counters are lost; the ones read from
-- player_stats, weapon_progress and zombie_stats stay.
DROP TABLE IF EXISTS achievement_progress;
DELETE FROM schema_migrations WHERE name = '005_figurinhas.sql';
