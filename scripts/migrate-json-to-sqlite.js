'use strict';

/**
 * migrate-json-to-sqlite.js
 *
 * One-time migration script: reads data/world-state.json and writes all
 * data into data/world.db via WorldDatabase.
 *
 * Usage:
 *   node scripts/migrate-json-to-sqlite.js
 *   npm run migrate
 *
 * The original JSON file is NOT deleted; it stays as a backup.
 */

const fs   = require('fs');
const path = require('path');

// Resolve paths relative to the project root (one level up from scripts/)
const ROOT          = path.resolve(__dirname, '..');
const JSON_PATH     = path.join(ROOT, 'data', 'world-state.json');
const SQLITE_PATH   = path.join(ROOT, 'data', 'world.db');
const WorldDatabase = require(path.join(ROOT, 'services', 'WorldDatabase'));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hr(char = '─', width = 60) {
    return char.repeat(width);
}

function log(msg) {
    process.stdout.write(msg + '\n');
}

function bail(msg, err) {
    process.stderr.write('\n[ERROR] ' + msg + '\n');
    if (err) process.stderr.write(err.stack || String(err));
    process.stderr.write('\n');
    process.exit(1);
}

// ─── Load JSON ────────────────────────────────────────────────────────────────

log('');
log(hr());
log('  BlockWorld  ·  JSON → SQLite Migration');
log(hr());
log('');
log(`  Source : ${JSON_PATH}`);
log(`  Target : ${SQLITE_PATH}`);
log('');

if (!fs.existsSync(JSON_PATH)) {
    bail(`JSON save file not found at: ${JSON_PATH}\n  Nothing to migrate.`);
}

let saved;
try {
    const raw = fs.readFileSync(JSON_PATH, 'utf8');
    if (!raw || !raw.trim()) {
        bail('world-state.json is empty — nothing to migrate.');
    }
    saved = JSON.parse(raw);
} catch (err) {
    bail('Failed to parse world-state.json', err);
}

// ─── Validate JSON structure ──────────────────────────────────────────────────

// Support both new format (foregroundWorld/backgroundWorld) and legacy (world)
let foregroundWorld = saved.foregroundWorld;
let backgroundWorld = saved.backgroundWorld;

if (!Array.isArray(foregroundWorld) || !Array.isArray(backgroundWorld)) {
    // Legacy single-array format (older saves had saved.world with all blocks)
    if (Array.isArray(saved.world)) {
        log('  [warn] Legacy world format detected. Using saved.world as foreground.');
        foregroundWorld = saved.world;
        backgroundWorld = Array.from(
            { length: foregroundWorld.length },
            () => new Array((foregroundWorld[0] || []).length).fill(0)
        );
    } else {
        bail('world-state.json does not contain valid foregroundWorld/backgroundWorld arrays.');
    }
}

const WORLD_HEIGHT = foregroundWorld.length;
const WORLD_WIDTH  = foregroundWorld[0] ? foregroundWorld[0].length : 0;

log(`  World size : ${WORLD_WIDTH} × ${WORLD_HEIGHT}`);
log('');

// ─── Count non-AIR blocks for summary ────────────────────────────────────────

let fgNonAir = 0;
let bgNonAir = 0;
for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
        if ((foregroundWorld[y]?.[x] ?? 0) !== 0) fgNonAir++;
        if ((backgroundWorld[y]?.[x] ?? 0) !== 0) bgNonAir++;
    }
}

const doorEndpointsArray = Array.isArray(saved.doorEndpoints) ? saved.doorEndpoints : [];
const droppedItemsArray  = Array.isArray(saved.droppedItems)  ? saved.droppedItems  : [];
const nextItemId         = Number.isInteger(saved.nextItemId) && saved.nextItemId > 0
                           ? saved.nextItemId
                           : 1;

log(`  Foreground non-AIR blocks : ${fgNonAir}`);
log(`  Background non-AIR blocks : ${bgNonAir}`);
log(`  Door endpoints            : ${doorEndpointsArray.length}`);
log(`  Dropped items             : ${droppedItemsArray.length}`);
log(`  nextItemId                : ${nextItemId}`);
log(`  Version                   : ${saved.version ?? '(not set)'}`);
log(`  Saved at (JSON)           : ${saved.savedAt  ?? '(not set)'}`);
log('');

// ─── Run migration ────────────────────────────────────────────────────────────

// If the DB already exists, warn but continue (schema is CREATE IF NOT EXISTS)
if (fs.existsSync(SQLITE_PATH)) {
    log('  [warn] world.db already exists — data will be overwritten.');
    log('');
}

let db;
try {
    db = new WorldDatabase(SQLITE_PATH);
} catch (err) {
    bail('Failed to open/create SQLite database', err);
}

// 1. World blocks ──────────────────────────────────────────────────────────────
log('  [1/4] Migrating world blocks …');
const t0 = Date.now();
try {
    db.saveWorld(foregroundWorld, backgroundWorld);
} catch (err) {
    db.close();
    bail('saveWorld failed', err);
}
log(`        Done in ${Date.now() - t0} ms`);

// 2. Door endpoints ────────────────────────────────────────────────────────────
log('  [2/4] Migrating door endpoints …');
try {
    // saveDoorEndpoints expects a Map<string, {x,y,pairId}>
    const doorMap = new Map();
    for (const door of doorEndpointsArray) {
        if (door && Number.isInteger(door.x) && Number.isInteger(door.y)) {
            doorMap.set(`${door.x},${door.y}`, {
                x:      door.x,
                y:      door.y,
                pairId: door.pairId ?? 0
            });
        }
    }
    db.saveDoorEndpoints(doorMap);
} catch (err) {
    db.close();
    bail('saveDoorEndpoints failed', err);
}
log(`        Done  (${doorEndpointsArray.length} doors)`);

// 3. Dropped items ─────────────────────────────────────────────────────────────
log('  [3/4] Migrating dropped items …');
try {
    db.saveDroppedItems(droppedItemsArray);
} catch (err) {
    db.close();
    bail('saveDroppedItems failed', err);
}
log(`        Done  (${droppedItemsArray.length} items)`);

// 4. Metadata ─────────────────────────────────────────────────────────────────
log('  [4/4] Migrating metadata …');
try {
    db.saveMeta('nextItemId', nextItemId);
    db.saveMeta('version',    saved.version  ?? 1);
    db.saveMeta('savedAt',    saved.savedAt  ?? new Date().toISOString());
    db.saveMeta('migratedAt', new Date().toISOString());
    db.saveMeta('migratedFrom', JSON_PATH);
} catch (err) {
    db.close();
    bail('saveMeta failed', err);
}
log('        Done');

// ─── Verify round-trip ────────────────────────────────────────────────────────
log('');
log('  Verifying round-trip read …');

let verifyOk = true;
try {
    const { foregroundWorld: fg2, backgroundWorld: bg2 } = db.loadWorld(WORLD_WIDTH, WORLD_HEIGHT);
    const doors2 = db.loadDoorEndpoints();
    const items2 = db.loadDroppedItems();
    const nid2   = db.getMeta('nextItemId');

    // Count non-AIR in reloaded data
    let fgNonAir2 = 0;
    let bgNonAir2 = 0;
    for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let x = 0; x < WORLD_WIDTH; x++) {
            if ((fg2[y]?.[x] ?? 0) !== 0) fgNonAir2++;
            if ((bg2[y]?.[x] ?? 0) !== 0) bgNonAir2++;
        }
    }

    const fgOk    = fgNonAir2   === fgNonAir;
    const bgOk    = bgNonAir2   === bgNonAir;
    const doorOk  = doors2.length === doorEndpointsArray.length;
    const itemsOk = items2.length === droppedItemsArray.length;
    const nidOk   = nid2         === nextItemId;

    log(`  Foreground blocks : ${fgNonAir2} / ${fgNonAir}  ${fgOk   ? '✓' : '✗ MISMATCH'}`);
    log(`  Background blocks : ${bgNonAir2} / ${bgNonAir}  ${bgOk   ? '✓' : '✗ MISMATCH'}`);
    log(`  Door endpoints    : ${doors2.length} / ${doorEndpointsArray.length}  ${doorOk  ? '✓' : '✗ MISMATCH'}`);
    log(`  Dropped items     : ${items2.length} / ${droppedItemsArray.length}  ${itemsOk ? '✓' : '✗ MISMATCH'}`);
    log(`  nextItemId        : ${nid2} / ${nextItemId}  ${nidOk   ? '✓' : '✗ MISMATCH'}`);

    verifyOk = fgOk && bgOk && doorOk && itemsOk && nidOk;
} catch (err) {
    log(`  Verification error: ${err.message}`);
    verifyOk = false;
}

// ─── Summary ──────────────────────────────────────────────────────────────────

db.close();

log('');
log(hr());
if (verifyOk) {
    const dbSizeKB = Math.round(fs.statSync(SQLITE_PATH).size / 1024);
    log(`  ✓  Migration complete!`);
    log(`     world.db size : ${dbSizeKB} KB`);
    log(`     The original world-state.json has NOT been deleted.`);
} else {
    log('  ✗  Migration finished with verification mismatches.');
    log('     Review the output above. world-state.json is untouched.');
    process.exitCode = 1;
}
log(hr());
log('');
