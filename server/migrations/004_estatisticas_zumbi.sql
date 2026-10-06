-- Zumbi mode stats: the co-op mode doesn't touch player_stats (a zombie isn't a player kill, a co-op death
-- isn't a player's death), so it keeps its own totals here, written in the same flush as the rest of the
-- progress (server/accounts.ts flushProgress). The row is created on the first write (an upsert), so older
-- accounts need nothing. best_wave keeps the highest wave reached; every other column is a running total.
CREATE TABLE zombie_stats (
    profile_id      uuid PRIMARY KEY REFERENCES player_profile(id) ON DELETE CASCADE,
    matches         int NOT NULL DEFAULT 0,                -- matches seen to the end (won or lost)
    wins            int NOT NULL DEFAULT 0,
    best_wave       int NOT NULL DEFAULT 0,
    waves           int NOT NULL DEFAULT 0,                -- waves survived (not dead when it ended)
    kills           int NOT NULL DEFAULT 0,
    headshots       int NOT NULL DEFAULT 0,
    groin_kills     int NOT NULL DEFAULT 0,
    knife_kills     int NOT NULL DEFAULT 0,
    grenade_kills   int NOT NULL DEFAULT 0,
    bosses          int NOT NULL DEFAULT 0,                -- final blows on a boss, all three together
    coveiro_kills   int NOT NULL DEFAULT 0,
    noiva_kills     int NOT NULL DEFAULT 0,
    prefeito_kills  int NOT NULL DEFAULT 0,
    downs           int NOT NULL DEFAULT 0,
    revives         int NOT NULL DEFAULT 0,                -- teammates this player got back up
    deaths          int NOT NULL DEFAULT 0,
    coffin_rolls    int NOT NULL DEFAULT 0,
    updated_at      timestamptz NOT NULL DEFAULT now()
);
