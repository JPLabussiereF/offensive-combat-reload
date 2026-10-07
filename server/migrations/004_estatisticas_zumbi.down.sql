-- Rollback of 004_estatisticas_zumbi.sql (run by hand). The zumbi totals are lost.
DROP TABLE IF EXISTS zombie_stats;
DELETE FROM schema_migrations WHERE name = '004_estatisticas_zumbi.sql';
