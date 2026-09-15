CREATE TABLE IF NOT EXISTS Session (id TEXT PRIMARY KEY, shop TEXT NOT NULL, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS Session_shop ON Session(shop);
CREATE TABLE IF NOT EXISTS GalleryWorkspace (shop TEXT PRIMARY KEY, payload TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS ArtistReport (
 id TEXT PRIMARY KEY, shop TEXT NOT NULL, month TEXT NOT NULL, artistId TEXT NOT NULL,
 snapshot TEXT NOT NULL, status TEXT NOT NULL, providerId TEXT, error TEXT,
 createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(shop,month,artistId)
);
CREATE INDEX IF NOT EXISTS ArtistReport_shop_created ON ArtistReport(shop,createdAt);
CREATE TABLE IF NOT EXISTS MonthlyRun (
 id TEXT PRIMARY KEY, shop TEXT NOT NULL, month TEXT NOT NULL, status TEXT NOT NULL, result TEXT,
 payload TEXT NOT NULL DEFAULT '{}', leaseUntil INTEGER NOT NULL DEFAULT 0,
 createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS MonthlyRun_shop_created ON MonthlyRun(shop,createdAt);
CREATE INDEX IF NOT EXISTS MonthlyRun_status_lease ON MonthlyRun(status,leaseUntil);
CREATE TABLE IF NOT EXISTS SyncJob (
 id TEXT PRIMARY KEY, shop TEXT NOT NULL, month TEXT NOT NULL, version INTEGER NOT NULL,
 payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
 updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS SyncJob_shop ON SyncJob(shop);
