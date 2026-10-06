-- Sticker album, own counters (shared/achievements.ts, fonte "propria"): the stickers that don't come from a
-- number the account already keeps. One row per sticker (its id) or, for a collection, per item ("id:item").
-- Running totals are added to and records keep the highest (server/accounts.ts flushProgress); rows are made on
-- the first write.
CREATE TABLE achievement_progress (
    profile_id  uuid NOT NULL REFERENCES player_profile(id) ON DELETE CASCADE,
    sticker     text NOT NULL,
    progress    bigint NOT NULL DEFAULT 0,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, sticker)
);
