-- Weapon upgrades (ADR - Progressão por melhorias de arma): every weapon level now unlocks an upgrade instead
-- of being a differently named weapon, there are secondary guns (pistol, SMG), and the player's Arsenal choice
-- (secondary gun, optional upgrades turned on) is saved as JSON on the profile, validated by
-- shared/progression.ts on every read and write. NULL = not chosen yet: the server derives it once from the
-- old equipped_level column (legacyChoice), which is kept, read-only, for that.

-- The new guns get their own progress rows.
ALTER TABLE weapon_progress DROP CONSTRAINT IF EXISTS weapon_progress_weapon_check;
ALTER TABLE weapon_progress ADD CONSTRAINT weapon_progress_weapon_check CHECK (weapon IN ('rifle', 'pistola', 'smg', 'faca', 'granada'));
INSERT INTO weapon_progress (profile_id, weapon)
SELECT p.id, w.weapon FROM player_profile p CROSS JOIN (VALUES ('pistola'), ('smg')) AS w(weapon)
ON CONFLICT DO NOTHING;

ALTER TABLE player_profile ADD COLUMN loadout jsonb;

-- The new levels cost more points. Nobody loses what they had: the points of each weapon are raised to the
-- new level matching their old one (old level -> new level: rifle and knife 2->2, 3-4->3, 5-6->4, 7->5;
-- grenade 2->2 (land mine), 3->3 (Dose Dupla)). Old thresholds on the left, new ones on the right.
UPDATE weapon_progress SET xp = GREATEST(xp, CASE
    WHEN xp >= 5500 THEN 7000 WHEN xp >= 2800 THEN 4500 WHEN xp >= 1000 THEN 2500 WHEN xp >= 400 THEN 1000 ELSE 0 END)
 WHERE weapon = 'rifle';
UPDATE weapon_progress SET xp = GREATEST(xp, CASE
    WHEN xp >= 4100 THEN 4500 WHEN xp >= 2100 THEN 2800 WHEN xp >= 750 THEN 1500 WHEN xp >= 300 THEN 600 ELSE 0 END)
 WHERE weapon = 'faca';
UPDATE weapon_progress SET xp = GREATEST(xp, CASE
    WHEN xp >= 1300 THEN 1800 WHEN xp >= 500 THEN 700 ELSE 0 END)
 WHERE weapon = 'granada';
