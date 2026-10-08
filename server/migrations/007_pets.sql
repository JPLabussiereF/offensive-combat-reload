-- Pets (PF-29): the pet an account takes along (shared/pets.ts), validated by sanitizePet on every read and write
-- like the appearance: { id (null: none, it stays in the yard), pvp, pve, cfg: each pet's name (only its owner sees
-- it), coat and collar }. NULL = no pet ever chosen (a new account has none).
ALTER TABLE player_profile ADD COLUMN pet jsonb;
