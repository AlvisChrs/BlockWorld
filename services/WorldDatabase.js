'use strict';

/**
 * WorldDatabase - SQLite persistence layer using better-sqlite3.
 *
 * Schema overview:
 *   world_blocks  - foreground & background block data (AIR = absence)
 *   world_meta    - key/value store for nextItemId, savedAt, version, etc.
 *   door_endpoints - door pair registry
 *   dropped_items  - physical item drops on the ground
 *
 * All bulk writes are wrapped in transactions for performance.
 */

const Database = require('better-sqlite3');

// Block IDs must match the BLOCKS constants in server.js
const AIR = 0;

class WorldDatabase {
    /**
     * @param {string} dbPath  - Absolute or relative path to the .db file.
     *                           The file (and parent directories) will be
     *                           created automatically if they do not exist.
     */
    constructor(dbPath) {
        if (!dbPath) throw new Error('WorldDatabase: dbPath is required');

        // better-sqlite3 opens/creates the file synchronously
        this.db = new Database(dbPath);

        // WAL mode gives much better write throughput for games
        this.db.pragma('journal_mode = WAL');
        // Reasonable safety without full fsync on every write
        this.db.pragma('synchronous = NORMAL');

        this.initSchema();
        this._prepareStatements();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Schema
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Create all tables if they do not already exist.
     * Safe to call multiple times (idempotent).
     */
    initSchema() {
        this.db.exec(`
            -- Foreground and background blocks.
            -- AIR blocks are NOT stored; absence in this table means AIR.
            CREATE TABLE IF NOT EXISTS world_blocks (
                x        INTEGER NOT NULL,
                y        INTEGER NOT NULL,
                layer    TEXT    NOT NULL CHECK(layer IN ('foreground', 'background')),
                block_id INTEGER NOT NULL,
                PRIMARY KEY (x, y, layer)
            );

            -- Arbitrary key/value metadata (nextItemId, savedAt, version …)
            CREATE TABLE IF NOT EXISTS world_meta (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            -- Door teleport pair registry
            CREATE TABLE IF NOT EXISTS door_endpoints (
                x       INTEGER NOT NULL,
                y       INTEGER NOT NULL,
                pair_id INTEGER NOT NULL,
                PRIMARY KEY (x, y)
            );

            -- Physical item drops lying on the ground
            CREATE TABLE IF NOT EXISTS dropped_items (
                id         INTEGER PRIMARY KEY,
                item_type  INTEGER NOT NULL,
                x          REAL    NOT NULL,
                y          REAL    NOT NULL,
                vy         REAL    NOT NULL DEFAULT 0,
                amount     INTEGER NOT NULL DEFAULT 1,
                spawn_time INTEGER NOT NULL
            );
        `);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Prepared statements (cached for performance)
    // ─────────────────────────────────────────────────────────────────────────

    _prepareStatements() {
        // world_blocks
        this._stmtUpsertBlock = this.db.prepare(`
            INSERT INTO world_blocks (x, y, layer, block_id)
            VALUES (@x, @y, @layer, @block_id)
            ON CONFLICT(x, y, layer) DO UPDATE SET block_id = excluded.block_id
        `);
        this._stmtDeleteAllBlocks = this.db.prepare(`DELETE FROM world_blocks`);
        this._stmtSelectAllBlocks = this.db.prepare(`
            SELECT x, y, layer, block_id FROM world_blocks
        `);

        // world_meta
        this._stmtUpsertMeta = this.db.prepare(`
            INSERT INTO world_meta (key, value)
            VALUES (@key, @value)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `);
        this._stmtGetMeta = this.db.prepare(`
            SELECT value FROM world_meta WHERE key = ?
        `);

        // door_endpoints
        this._stmtDeleteAllDoors = this.db.prepare(`DELETE FROM door_endpoints`);
        this._stmtInsertDoor = this.db.prepare(`
            INSERT INTO door_endpoints (x, y, pair_id) VALUES (@x, @y, @pairId)
        `);
        this._stmtSelectAllDoors = this.db.prepare(`
            SELECT x, y, pair_id AS pairId FROM door_endpoints
        `);

        // dropped_items
        this._stmtDeleteAllItems = this.db.prepare(`DELETE FROM dropped_items`);
        this._stmtInsertItem = this.db.prepare(`
            INSERT INTO dropped_items (id, item_type, x, y, vy, amount, spawn_time)
            VALUES (@id, @itemType, @x, @y, @vy, @amount, @spawnTime)
        `);
        this._stmtSelectAllItems = this.db.prepare(`
            SELECT id, item_type AS itemType, x, y, vy, amount, spawn_time AS spawnTime
            FROM dropped_items
        `);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // World Blocks
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Persist foreground and background worlds to the database.
     * Only non-AIR blocks are stored; AIR (0) is represented by absence.
     * Existing block data is replaced entirely via DELETE + INSERT transaction.
     *
     * @param {number[][]} foregroundWorld  - 2D array [y][x] of block IDs
     * @param {number[][]} backgroundWorld  - 2D array [y][x] of block IDs
     */
    saveWorld(foregroundWorld, backgroundWorld) {
        const insertAll = this.db.transaction(() => {
            this._stmtDeleteAllBlocks.run();

            for (let y = 0; y < foregroundWorld.length; y++) {
                const fgRow = foregroundWorld[y];
                const bgRow = backgroundWorld[y];
                for (let x = 0; x < fgRow.length; x++) {
                    const fgId = fgRow[x];
                    if (fgId !== AIR) {
                        this._stmtUpsertBlock.run({ x, y, layer: 'foreground', block_id: fgId });
                    }
                    if (bgRow) {
                        const bgId = bgRow[x];
                        if (bgId !== AIR) {
                            this._stmtUpsertBlock.run({ x, y, layer: 'background', block_id: bgId });
                        }
                    }
                }
            }
        });

        insertAll();
    }

    /**
     * Load world blocks from the database and return 2D arrays.
     * Cells not present in the database are filled with AIR (0).
     *
     * @param {number} worldWidth  - Expected grid width  (e.g. 100)
     * @param {number} worldHeight - Expected grid height (e.g. 50)
     * @returns {{ foregroundWorld: number[][], backgroundWorld: number[][] }}
     */
    loadWorld(worldWidth, worldHeight) {
        // Pre-fill both grids with AIR
        const foregroundWorld = Array.from(
            { length: worldHeight },
            () => new Array(worldWidth).fill(AIR)
        );
        const backgroundWorld = Array.from(
            { length: worldHeight },
            () => new Array(worldWidth).fill(AIR)
        );

        const rows = this._stmtSelectAllBlocks.all();
        for (const row of rows) {
            const { x, y, layer, block_id } = row;
            // Guard against out-of-bounds data
            if (x < 0 || x >= worldWidth || y < 0 || y >= worldHeight) continue;

            if (layer === 'foreground') {
                foregroundWorld[y][x] = block_id;
            } else {
                backgroundWorld[y][x] = block_id;
            }
        }

        return { foregroundWorld, backgroundWorld };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Door Endpoints
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Replace all door endpoint records.
     *
     * @param {Map<string, {x:number, y:number, pairId:number}>} doorEndpoints
     *        The doorEndpoints Map from server.js
     */
    saveDoorEndpoints(doorEndpoints) {
        const replaceAll = this.db.transaction(() => {
            this._stmtDeleteAllDoors.run();
            for (const door of doorEndpoints.values()) {
                this._stmtInsertDoor.run({ x: door.x, y: door.y, pairId: door.pairId });
            }
        });
        replaceAll();
    }

    /**
     * Load all door endpoints.
     *
     * @returns {{ x: number, y: number, pairId: number }[]}
     */
    loadDoorEndpoints() {
        return this._stmtSelectAllDoors.all();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Dropped Items
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Replace all dropped item records.
     *
     * @param {{ id:number, itemType:number, x:number, y:number,
     *           vy:number, amount:number, spawnTime:number }[]} items
     */
    saveDroppedItems(items) {
        const replaceAll = this.db.transaction(() => {
            this._stmtDeleteAllItems.run();
            for (const item of items) {
                this._stmtInsertItem.run({
                    id:        item.id,
                    itemType:  item.itemType,
                    x:         item.x,
                    y:         item.y,
                    vy:        item.vy   ?? 0,
                    amount:    item.amount,
                    spawnTime: item.spawnTime ?? Date.now()
                });
            }
        });
        replaceAll();
    }

    /**
     * Load all dropped items.
     *
     * @returns {{ id:number, itemType:number, x:number, y:number,
     *             vy:number, amount:number, spawnTime:number }[]}
     */
    loadDroppedItems() {
        return this._stmtSelectAllItems.all();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Metadata
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Persist a metadata value.  The value is JSON-serialised so any
     * JSON-compatible type (number, string, boolean, object) can be stored.
     *
     * @param {string} key
     * @param {*}      value
     */
    saveMeta(key, value) {
        this._stmtUpsertMeta.run({ key, value: JSON.stringify(value) });
    }

    /**
     * Retrieve a metadata value.  Returns the deserialised value, or
     * undefined if the key does not exist.
     *
     * @param {string} key
     * @returns {*}
     */
    getMeta(key) {
        const row = this._stmtGetMeta.get(key);
        if (!row) return undefined;
        try {
            return JSON.parse(row.value);
        } catch {
            return row.value; // Return raw string if JSON.parse fails
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Close the database connection.
     * Should be called on graceful shutdown.
     */
    close() {
        if (this.db && this.db.open) {
            this.db.close();
        }
    }
}

module.exports = WorldDatabase;
