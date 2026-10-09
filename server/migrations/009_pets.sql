-- Pets (PF-29): the pet an account takes along (shared/pets.ts), validated by sanitizePet on every read and write
-- like the appearance: { id (null: none, it stays in the yard), pvp, pve, cfg: each pet's name (only its owner sees
-- it), coat and collar }. NULL = no pet ever chosen (a new account has none).
-- Numbered 009 (P30: 007 is PF-26's 007_album_colado, 008 is PF-28's). A database that already ran it as
-- 007_pets.sql has the column: IF NOT EXISTS lets it record 009_pets.sql without failing.
ALTER TABLE player_profile ADD COLUMN IF NOT EXISTS pet jsonb;
