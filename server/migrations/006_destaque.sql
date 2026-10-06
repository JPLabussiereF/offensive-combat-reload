-- Sticker album, showcase: the sticker a player shows to the others (its id) and the title they wear (a page id,
-- earned with every sticker of the page at holographic or better). The server checks both on every change
-- (shared/achievements.ts); NULL = none.
ALTER TABLE player_profile ADD COLUMN featured_sticker text;
ALTER TABLE player_profile ADD COLUMN title text;
