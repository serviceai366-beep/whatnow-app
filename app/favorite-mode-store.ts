import type { D1DatabaseLike } from "./file-store.ts";

export const favoriteModes = ["understand", "create", "translate"] as const;
export type FavoriteMode = (typeof favoriteModes)[number] | null;

type FavoriteModeRow = { user_id: string; favorite_mode: string | null };

function isFavoriteMode(value: unknown): value is Exclude<FavoriteMode, null> {
  return typeof value === "string" && favoriteModes.includes(value as Exclude<FavoriteMode, null>);
}

function createStore(db: D1DatabaseLike) {
  let initialized: Promise<void> | null = null;
  const initialize = () => {
    initialized ??= db.prepare(`CREATE TABLE IF NOT EXISTS user_favorite_modes (
      user_id TEXT PRIMARY KEY NOT NULL,
      favorite_mode TEXT,
      updated_at INTEGER NOT NULL,
      CHECK (favorite_mode IS NULL OR favorite_mode IN ('understand', 'create', 'translate'))
    )`).run().then(() => undefined);
    return initialized;
  };

  return {
    async read(userId: string): Promise<FavoriteMode> {
      await initialize();
      const row = await db.prepare("SELECT user_id, favorite_mode FROM user_favorite_modes WHERE user_id = ? LIMIT 1")
        .bind(userId).first<FavoriteModeRow>();
      return isFavoriteMode(row?.favorite_mode) ? row.favorite_mode : null;
    },
    async write(userId: string, favoriteMode: FavoriteMode): Promise<FavoriteMode> {
      await initialize();
      await db.prepare(`INSERT INTO user_favorite_modes (user_id, favorite_mode, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET favorite_mode = excluded.favorite_mode, updated_at = excluded.updated_at`)
        .bind(userId, favoriteMode, Date.now()).run();
      return favoriteMode;
    },
  };
}

type FavoriteModeStore = ReturnType<typeof createStore>;
let storePromise: Promise<FavoriteModeStore | null> | null = null;

export async function getFavoriteModeStore(): Promise<FavoriteModeStore | null> {
  storePromise ??= (async () => {
    try {
      const runtime = await import("cloudflare:workers");
      const db = (runtime.env as unknown as { DB?: D1DatabaseLike }).DB;
      return db ? createStore(db) : null;
    } catch {
      return null;
    }
  })();
  return storePromise;
}

export function createFavoriteModeStoreForTests(db: D1DatabaseLike): FavoriteModeStore {
  return createStore(db);
}
