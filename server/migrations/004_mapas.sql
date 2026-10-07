-- Maps as data (PF-6): the official maps and the community's, every saved version kept, the GLB models they
-- use, and the staff's management of accounts (who did what in the audit trail).
--
-- A map's versions never change once written (a trigger refuses updates): saving writes a new one, and going
-- back to an older one only moves map.current_version. Matches in progress keep the version they started with.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE map (
    id               text PRIMARY KEY CHECK (id ~ '^[a-z0-9_-]{1,40}$'),
    kind             text NOT NULL CHECK (kind IN ('official', 'community')),
    name             text NOT NULL,
    author_id        uuid REFERENCES account(id) ON DELETE SET NULL,    -- null: the official maps shipped with the game
    current_version  int NOT NULL,
    exclusive_mode   text CHECK (exclusive_mode IN ('zumbi')),         -- null: open to every mode but the exclusive ones
    forked_from      text REFERENCES map(id) ON DELETE SET NULL,
    hidden_at        timestamptz,
    hidden_by        uuid,
    hidden_reason    text,
    deleted_at       timestamptz,                                     -- logical deletion: the versions stay
    play_count       bigint NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
-- Search by name (ILIKE '%...%') and the two orders of the lists, among the maps anyone can see.
CREATE INDEX map_name_trgm_idx ON map USING gin (name gin_trgm_ops);
CREATE INDEX map_recent_idx ON map (kind, updated_at DESC) WHERE deleted_at IS NULL AND hidden_at IS NULL;
CREATE INDEX map_played_idx ON map (kind, play_count DESC) WHERE deleted_at IS NULL AND hidden_at IS NULL;
CREATE INDEX map_author_idx ON map (author_id);

CREATE TABLE map_version (
    map_id      text NOT NULL REFERENCES map(id) ON DELETE CASCADE,
    version     int NOT NULL CHECK (version >= 1),
    data        jsonb NOT NULL,                  -- shared/mapData.ts MapData
    format      int NOT NULL,                    -- MapData.formato
    draw_calls  int,                             -- client/world/budget.ts, measured when saved
    triangles   int,
    colliders   int,
    navmesh     bytea,                           -- zumbi maps: recast-navigation's exportNavMesh
    created_by  uuid,                            -- the account that saved it (no FK: the row never changes)
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (map_id, version)
);

-- The version a map plays now must exist (checked at commit: the map row and its first version go in together).
ALTER TABLE map ADD CONSTRAINT map_current_version_fk FOREIGN KEY (id, current_version)
    REFERENCES map_version (map_id, version) DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION map_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'map_version é imutável: salve uma versão nova';
END
$$;
CREATE TRIGGER map_version_immutable BEFORE UPDATE ON map_version FOR EACH ROW EXECUTE FUNCTION map_version_immutable();

-- GLB models uploaded for the maps, stored on disk by their SHA-256 (MAPAS_DIR); one row per distinct file.
CREATE TABLE map_asset (
    sha256         text PRIMARY KEY CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    owner_id       uuid REFERENCES account(id) ON DELETE SET NULL,        -- who sent it first
    original_name  text,
    bytes          int NOT NULL,
    triangles      int NOT NULL,
    primitives     int NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX map_asset_owner_idx ON map_asset (owner_id);

-- Which models each version uses.
CREATE TABLE map_version_asset (
    map_id   text NOT NULL,
    version  int NOT NULL,
    sha256   text NOT NULL REFERENCES map_asset(sha256),
    PRIMARY KEY (map_id, version, sha256),
    FOREIGN KEY (map_id, version) REFERENCES map_version (map_id, version) ON DELETE CASCADE
);
CREATE INDEX map_version_asset_sha_idx ON map_version_asset (sha256);

-- Who did it, when a staff member acted on someone else's account (null: the account itself or the console).
ALTER TABLE auth_event ADD COLUMN actor_id uuid;

UPDATE role SET description = 'Tudo o que o admin faz, menos agir sobre contas de admin e promover alguém a admin' WHERE name = 'moderador';

-- The map each stay in a session was played on.
ALTER TABLE session_participation ADD COLUMN map_id text;
