const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const ChunkManager = require('./world/ChunkManager');

// ─── Import Services & Modules ──────────────────────────────────────────────
const Logger = require('./services/Logger');
const WorldDatabase = require('./services/WorldDatabase');
const NetworkHandler = require('./services/NetworkHandler');
const Validator = require('./utils/Validator');

const PlayerManager = require('./modules/PlayerManager');
const MobManager = require('./modules/MobManager');
const EnvironmentManager = require('./modules/EnvironmentManager');
const CombatSystem = require('./modules/CombatSystem');

// ─── Initialize Services ──────────────────────────────────────────────────────
const logger = new Logger({ isDev: process.env.NODE_ENV !== 'production' });
const DATA_DIR = path.join(__dirname, 'data');
const dbPath = path.join(DATA_DIR, 'world.db');
const db = new WorldDatabase(dbPath);
let autoSaveTimer = null;
let autoSaveIntervalTimer = null;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

const networkHandler = new NetworkHandler({
    io,
    logger,
    reconnectTimeout: 30000,
    maxReconnectAttempts: 5
});

app.use(express.static('public'));

// Setup error handlers
networkHandler.setupErrorHandlers();

// Game Constants & Configuration
const gameConfig = require('./config/gameConfig');
const {
    WORLD_WIDTH, WORLD_HEIGHT, BLOCK_SIZE, CHUNK_SIZE, MAX_HP,
    LAVA_DAMAGE_INTERVAL, HP_REGEN_INTERVAL, MAX_BUILD_RANGE,
    MAX_PLAYER_SPEED, MOVE_DISTANCE_TOLERANCE, PLAYER_RESPAWN_DELAY,
    MOB_MAX_COUNT, MOB_SPAWN_INTERVAL, CYCLE_DURATION, ADMIN_PASSWORD,
    PORT, DEBUG, BLOCKS, ITEMS, RECIPES, OBJECTIVE_IDS, isBackground,
    VALID_BLOCK_IDS, VALID_ITEM_IDS, BACKGROUND_BLOCK_IDS
} = gameConfig;

const DATA_DIR_PATH = DATA_DIR;
let gameTime = 0;

// ─── Procedural Natural World Generation ──────────────────────────────────────
let world = [];
let backgroundWorld = [];
function createEmptyGrid(fill = BLOCKS.AIR) {
    return Array.from({ length: WORLD_HEIGHT }, () => new Array(WORLD_WIDTH).fill(fill));
}

function generateNaturalWorld() {
    world = createEmptyGrid();
    backgroundWorld = createEmptyGrid();

    const surfaceHeights = [];
    for (let x = 0; x < WORLD_WIDTH; x++) {
        const sy = Math.floor(22 + Math.sin(x * 0.12) * 2.5 + Math.cos(x * 0.04) * 2);
        surfaceHeights[x] = sy;
        
        world[sy][x] = BLOCKS.GRASS;

        const dirtDepth = sy + 8 + Math.floor(Math.sin(x * 0.3) * 2);
        for (let y = sy + 1; y <= dirtDepth && y < WORLD_HEIGHT; y++) {
            world[y][x] = BLOCKS.DIRT;
        }

        for (let y = dirtDepth + 1; y < WORLD_HEIGHT; y++) {
            world[y][x] = BLOCKS.STONE;
        }
    }

    for (let x = 5; x < WORLD_WIDTH - 5; x++) {
        for (let y = 36; y < WORLD_HEIGHT - 3; y++) {
            const r = Math.random();
            if (r < 0.06) world[y][x] = BLOCKS.ICE;
            else if (r > 0.94) world[y][x] = BLOCKS.LAVA;
        }
    }

    for (let x = 4; x < WORLD_WIDTH - 4; x += Math.floor(4 + Math.random() * 5)) {
        const sy = surfaceHeights[x];
        if (Math.random() < 0.75) {
            const treeHeight = 3 + Math.floor(Math.random() * 2);
            for (let h = 1; h <= treeHeight; h++) {
                if (sy - h >= 0) world[sy - h][x] = BLOCKS.WOOD;
            }
            const topY = sy - treeHeight - 1;
            for (let lx = x - 1; lx <= x + 1; lx++) {
                for (let ly = topY - 1; ly <= topY; ly++) {
                    if (lx >= 0 && lx < WORLD_WIDTH && ly >= 0) {
                        if (world[ly][lx] === BLOCKS.AIR) world[ly][lx] = BLOCKS.LEAVES;
                    }
                }
            }
        }
    }
}

// ─── Initialize Modules ───────────────────────────────────────────────────────
const playerManager = new PlayerManager({ maxHp: MAX_HP, blockSize: BLOCK_SIZE, chunkSize: CHUNK_SIZE });
const mobManager = new MobManager({ maxMobs: MOB_MAX_COUNT, spawnInterval: MOB_SPAWN_INTERVAL, blockSize: BLOCK_SIZE, chunkSize: CHUNK_SIZE, worldWidth: WORLD_WIDTH });
const environmentManager = new EnvironmentManager({ cycleDuration: CYCLE_DURATION, lavaInterval: LAVA_DAMAGE_INTERVAL, regenInterval: HP_REGEN_INTERVAL, maxHp: MAX_HP });
const combatSystem = new CombatSystem({ maxHp: MAX_HP, respawnDelay: PLAYER_RESPAWN_DELAY, blockSize: BLOCK_SIZE, chunkSize: CHUNK_SIZE });

// Game State Containers
const players = playerManager.players;
let droppedItems = [];
let mobs = mobManager.mobs;
let nextItemId = 1;
let nextMobId = 1;

// Wire up shared players reference so NetworkHandler can access player data
networkHandler.players = players;

// Rate limiters for socket events (Protection against Socket Abuse / Spam)
const moveLimiter   = networkHandler.createRateLimiter(60, 1000);  // 60 moves/s
const buildLimiter  = networkHandler.createRateLimiter(10, 1000);  // 10 build actions/s
const craftLimiter  = networkHandler.createRateLimiter(5, 1000);   // 5 crafts/s
const attackLimiter = networkHandler.createRateLimiter(10, 1000);  // 10 attacks/s
const doorLimiter   = networkHandler.createRateLimiter(3, 1000);   // 3 door warps/s
const dropLimiter   = networkHandler.createRateLimiter(10, 1000);  // 10 drops/s

// Door blocks only store their visual type in `world`, so keep their pair ID separately.
const doorEndpoints = new Map();

// Chunk Manager for bandwidth optimization
let chunkManager = null;

// Spatial partitioning helpers
const DEFAULT_VIEW_RADIUS = CHUNK_SIZE * BLOCK_SIZE * 1.5; // pixels
function squared(v){ return v*v; }


function emitToChunkNeighbors(event, payload, chunkX, chunkY, range = 1) {
    for (let dx = -range; dx <= range; dx++) {
        for (let dy = -range; dy <= range; dy++) {
            const k = `${chunkX + dx},${chunkY + dy}`;
            io.to(`chunk:${k}`).emit(event, payload);
        }
    }
}

function sendToNearbyPlayers(event, payload, x, y, radius = DEFAULT_VIEW_RADIUS) {
    // Backwards-compatible API: route by chunk rooms based on coordinates
    const px = Math.floor(x / BLOCK_SIZE);
    const py = Math.floor(y / BLOCK_SIZE);
    const chunkX = Math.floor(px / CHUNK_SIZE);
    const chunkY = Math.floor(py / CHUNK_SIZE);
    emitToChunkNeighbors(event, payload, chunkX, chunkY, 1);
}

function sendMobsUpdateNearby() {
    io.emit('mobs_update', mobs);
    io.emit('items_update', droppedItems);
}

function isValidWorldGrid(candidate) {
    return Array.isArray(candidate) &&
        candidate.length === WORLD_HEIGHT &&
        candidate.every(row =>
            Array.isArray(row) &&
            row.length === WORLD_WIDTH &&
            row.every(blockId => Number.isInteger(blockId) && Object.values(BLOCKS).includes(blockId))
        );
}

function loadWorldState() {
    try {
        if (!fs.existsSync(dbPath) || db.isWorldEmpty()) {
            generateNaturalWorld();
            return;
        }

        const loaded = db.loadWorld(WORLD_WIDTH, WORLD_HEIGHT);
        world = loaded.foregroundWorld;
        backgroundWorld = loaded.backgroundWorld;

        droppedItems = db.loadDroppedItems() || [];
        nextItemId = db.getMeta('nextItemId') || 1;
        gameTime = db.getMeta('gameTime') || 0;

        const doors = db.loadDoorEndpoints() || [];
        doorEndpoints.clear();
        for (const door of doors) {
            doorEndpoints.set(doorKey(door.x, door.y), { x: door.x, y: door.y, pairId: door.pairId });
        }

        console.log(`[save] Loaded world state from SQLite`);
    } catch (err) {
        console.error('[save] Failed to load world state. Generating new world.', err);
        generateNaturalWorld();
    }
}

function saveWorldState() {
    try {
        db.saveWorld(world, backgroundWorld);
        db.saveDoorEndpoints(doorEndpoints);
        db.saveDroppedItems(droppedItems);
        db.saveMeta('nextItemId', nextItemId);
        db.saveMeta('gameTime', gameTime);
        if (DEBUG) console.log('[save] world saved to SQLite');
    } catch (err) {
        console.error('[save] Failed to save world state.', err);
    }
}

function scheduleWorldSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        saveWorldState();
    }, 1000);
}

function shutdown(signal) {
    logger.info('Shutdown signal received', { signal });
    
    if (autoSaveIntervalTimer) clearInterval(autoSaveIntervalTimer);
    
    saveWorldState();
    db.close();
    
    logger.info('Final save completed, exiting gracefully');
    process.exit(0);
}

loadWorldState();

// Initialize chunk manager from loaded world
chunkManager = new ChunkManager(WORLD_WIDTH, WORLD_HEIGHT, CHUNK_SIZE);
chunkManager.initializeFromWorld(world, backgroundWorld);
playerManager.setChunkManager(chunkManager);
logger.info('Chunk grid initialized', { 
    chunks: `${chunkManager.chunksX}x${chunkManager.chunksY}` 
});

// Start auto-save
autoSaveIntervalTimer = setInterval(() => {
    saveWorldState();
}, 300000); // 5 minutes

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

function getBlock(x, y, layer = 'foreground') {
    return chunkManager.getBlock(x, y, layer);
}

function setBlock(x, y, blockId, layer = 'foreground') {
    const success = chunkManager.setBlock(x, y, blockId, layer);
    // Also update the grid for backward compatibility
    if (layer === 'background') backgroundWorld[y][x] = blockId;
    else world[y][x] = blockId;
    return success;
}

function findSurfaceY(x) {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
        if (getBlock(x, y) !== BLOCKS.AIR) return y;
    }
    return WORLD_HEIGHT - 1;
}

function getPlacementLayer(blockId) {
    return BACKGROUND_BLOCK_IDS.has(blockId) ? 'background' : 'foreground';
}

function sanitizeUsername(name) {
    if (typeof name !== 'string') return 'Player';
    const clean = name.trim().replace(/[^\w \-]/g, '').slice(0, 18);
    return clean || 'Player';
}

function fail(socket, message) {
    socket.emit('action_failed', message);
}

function doorKey(x, y) {
    return `${x},${y}`;
}

function assignDoorPair(x, y) {
    const pairCounts = new Map();
    for (const door of doorEndpoints.values()) {
        pairCounts.set(door.pairId, (pairCounts.get(door.pairId) || 0) + 1);
    }
    let pairId = 1;
    while ((pairCounts.get(pairId) || 0) >= 2) pairId++;
    const door = { x, y, pairId };
    doorEndpoints.set(doorKey(x, y), door);
    return door;
}

function getDoorAtOrNear(x, y) {
    for (const [dx, dy] of [[0, 0], [0, 1], [0, -1]]) {
        const door = doorEndpoints.get(doorKey(x + dx, y + dy));
        if (door) return door;
    }
    return null;
}

function getPairedDoor(sourceDoor) {
    for (const door of doorEndpoints.values()) {
        if (door.pairId === sourceDoor.pairId && doorKey(door.x, door.y) !== doorKey(sourceDoor.x, sourceDoor.y)) return door;
    }
    return null;
}

function spawnDroppedItem(itemType, pixelX, pixelY, amount = 1) {
    if (!VALID_ITEM_IDS.has(itemType) || !Number.isInteger(amount) || amount <= 0) return;
    const item = {
        id: nextItemId++,
        itemType,
        amount,
        x: pixelX,
        y: pixelY,
        vy: -3 - Math.random() * 2,
        spawnTime: Date.now()
    };
    droppedItems.push(item);
    io.emit('item_spawned', item);
    scheduleWorldSave();
}

function handleDeath(p, io, reason) {
    combatSystem.handlePlayerDeath(p, io, players, reason, emitToChunkNeighbors, sendToNearbyPlayers);
}

// ─── Day / Night Cycle Timer (120s loop) ──────────────────────────────────────
setInterval(() => {
    const { gameTime: updatedTime, isNight } = environmentManager.tickCycle();
    gameTime = updatedTime;

    io.emit('time_sync', { gameTime, isNight });

    if (gameTime === 0 && mobManager.getMobs().length > 0) {
        mobManager.clearMobs();
        mobs = mobManager.getMobs();
        sendMobsUpdateNearby();
        io.emit('server_message', '🌅 Daylight arrives! All night monsters burn away.');
        for (const id in players) {
            const p = players[id];
            if (p.hp > 0 && !p.isAdmin) {
                p.objectives[OBJECTIVE_IDS.SURVIVE_NIGHT] = true;
                io.to(id).emit('objective_event', { id: OBJECTIVE_IDS.SURVIVE_NIGHT });
            }
        }
    } else if (gameTime === 60) {
        io.emit('server_message', '🌙 Night falls! Beware of Knights in the dark...');
    }
}, 1000);

// ─── Ticker 1: Lava & Spike Damage Check ─────────────────────────────────────
setInterval(() => {
    environmentManager.checkEnvironmentHazards(players, getBlock, handleDeath, io, BLOCKS, BLOCK_SIZE);
}, LAVA_DAMAGE_INTERVAL);

// ─── Ticker 2: HP Regen ──────────────────────────────────────────────────────
setInterval(() => {
    environmentManager.regenerateHealth(players, io);
}, HP_REGEN_INTERVAL);

// ─── Ticker 3 removed (physicsWorker handles items) ─────────────────────────

// ─── Ticker 4: Knight Mob Spawner (NIGHT TIME ONLY!) & AI Loop ────────────────
setInterval(() => {
    const isNight = gameTime >= 60;
    if (isNight) {
        const newMob = mobManager.spawnNightMob(players, findSurfaceY);
        if (newMob) {
            mobs = mobManager.getMobs();
            const mcx = Math.floor((Math.floor(newMob.x / BLOCK_SIZE)) / CHUNK_SIZE);
            const mcy = Math.floor((Math.floor(newMob.y / BLOCK_SIZE)) / CHUNK_SIZE);
            emitToChunkNeighbors('mob_spawned', newMob, mcx, mcy, 1);
        }
    } else {
        // Despawn mobs during daytime
        if (mobManager.getMobs().length > 0) {
            mobManager.clearMobs();
            mobs = [];
            io.emit('mobs_cleared'); // tell clients to remove all mobs
        }
    }
}, MOB_SPAWN_INTERVAL);

// ─── 20 TPS Fixed Server Tick Loop ───────────────────────────────────────────
const SERVER_TICK_RATE = 20; // 20 Ticks per second (50ms)
setInterval(() => {
    // We don't overwrite mobs with mobManager.getMobs() here anymore!
    // Instead, physicsWorker is authoritative for movement.
}, 1000 / SERVER_TICK_RATE);


// Physics worker: full physics for mobs and items (gravity, movement, collisions, pickups)
const { Worker } = require('worker_threads');
let physicsWorker = null;
try {
    physicsWorker = new Worker(path.join(__dirname, 'world', 'physicsWorker.js'));
    physicsWorker.postMessage({ type: 'config', tickMs: 50, BLOCK_SIZE, CHUNK_SIZE, WORLD_WIDTH, WORLD_HEIGHT });
} catch (e) {
    console.error('[worker] failed to start physics worker', e);
    physicsWorker = null;
}

if (physicsWorker) {
    physicsWorker.on('message', (msg) => {
        if (!msg || msg.type !== 'physics') return;
        // Apply authoritative updates from worker
        if (Array.isArray(msg.mobs)) {
            const isNight = gameTime >= 60;
            if (isNight) {
                mobs = msg.mobs;
                mobManager.setMobs(mobs);
            }
        }
        if (Array.isArray(msg.droppedItems)) {
            const workerMap = new Map(msg.droppedItems.map(i => [i.id, i]));
            for (const item of droppedItems) {
                const wItem = workerMap.get(item.id);
                if (wItem) {
                    item.x = wItem.x;
                    item.y = wItem.y;
                    item.vy = wItem.vy;
                }
            }
        }

        // Process events emitted by worker
        for (const ev of msg.events || []) {
            if (!ev || !ev.type) continue;
            if (ev.type === 'item_picked_up') {
                const player = players[ev.playerId];
                if (player) {
                    player.inventory[ev.itemType] = (player.inventory[ev.itemType] || 0) + ev.amount;
                    io.to(ev.playerId).emit('inventory_update', player.inventory);

                    const idx = droppedItems.findIndex(i => i.id === ev.itemId);
                    if (idx !== -1) droppedItems.splice(idx, 1);
                    io.emit('item_picked_up', { itemId: ev.itemId, playerId: ev.playerId });
                }
            } else if (ev.type === 'mob_attack') {
                const target = players[ev.targetId];
                if (target) {
                    target.hp = Math.max(0, target.hp - ev.damage);
                    target.lastDamageTime = Date.now();
                    io.to(ev.targetId).emit('hp_update', target.hp);
                    const pcx = Math.floor((Math.floor(ev.x / BLOCK_SIZE)) / CHUNK_SIZE);
                    const pcy = Math.floor((Math.floor(ev.y / BLOCK_SIZE)) / CHUNK_SIZE);
                    emitToChunkNeighbors('mob_attack', { mobId: ev.mobId, targetId: ev.targetId, damage: ev.damage }, pcx, pcy, 1);
                    if (target.hp === 0) handleDeath(target, io, 'knight');
                }
            } else if (ev.type === 'mob_died') {
                const idx = mobs.findIndex(m => m.id === ev.mobId);
                if (idx !== -1) {
                    spawnDroppedItem(BLOCKS.STONE, ev.x, ev.y, 2);
                    spawnDroppedItem(BLOCKS.WOOD, ev.x + 8, ev.y, 1);
                    mobs.splice(idx, 1);
                    const rk = `${Math.floor((Math.floor(ev.x / BLOCK_SIZE)) / CHUNK_SIZE)},${Math.floor((Math.floor(ev.y / BLOCK_SIZE)) / CHUNK_SIZE)}`;
                    io.to(`chunk:${rk}`).emit('mob_died', { mobId: ev.mobId });
                }
            }
        }

        // Broadcast mobs per-chunk
        sendMobsUpdateNearby();
    });
}

setInterval(() => {
    if (physicsWorker) {
        try {
            physicsWorker.postMessage({ type: 'snapshot', mobs, droppedItems, players, world, backgroundWorld });
        } catch (e) { /* ignore */ }
    }
}, 50);


// ─── Socket Events ────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`[+] Player connected: ${socket.id}`);
    const username = sanitizeUsername(socket.handshake.auth?.username);

    const player = playerManager.addPlayer(socket.id, socket.handshake.auth?.username, BLOCKS, OBJECTIVE_IDS);

    const playerGridX = Math.floor(player.x / BLOCK_SIZE);
    const playerGridY = Math.floor(player.y / BLOCK_SIZE);
    const visibleChunks = chunkManager.getVisibleChunks(playerGridX, playerGridY, 1024, 768);
    const serializedChunks = [];
    
    for (const chunk of visibleChunks) {
        serializedChunks.push(chunkManager.serializeChunk(chunk.chunkX, chunk.chunkY, 'foreground'));
        serializedChunks.push(chunkManager.serializeChunk(chunk.chunkX, chunk.chunkY, 'background'));
        const key = `${chunk.chunkX},${chunk.chunkY}`;
        player.visibleChunks.add(key);
        // Subscribe socket to the chunk room for server-side area broadcasts
        socket.join(`chunk:${key}`);
    }

    let tb = 0;
    for (let c of serializedChunks) { if (c) for (let r of c.data) for (let b of r) if (b) tb++; }
    console.log(`[INIT] Sending to ${socket.id}, total non-air blocks in visible chunks: ${tb}`);

    socket.emit('init', {
        id: socket.id,
        chunks: serializedChunks,
        players: players,
        droppedItems: droppedItems,
        mobs: mobs,
        WORLD_WIDTH,
        WORLD_HEIGHT,
        BLOCK_SIZE,
        CHUNK_SIZE,
        MAX_HP,
        MAX_BUILD_RANGE,
        inventory: player.inventory,
        gameTime: gameTime,
        isNight: gameTime >= 60
    });

    socket.broadcast.emit('player_joined', players[socket.id]);

    // ─── NetworkHandler Integration ───────────────────────────────────────────
    // Per-socket error handling (logs socket errors via Logger)
    networkHandler.setupSocketErrorHandling(socket);

    // Reconnect: client can emit 'reconnect_player' with their previous session data
    socket.on('reconnect_player', networkHandler.handleReconnect(socket, socket.id, players[socket.id]));

    socket.on('player_move', (data) => {
        if (!moveLimiter(socket.id)) return; // rate limit: 60/s
        const p = players[socket.id];
        if (!p || p.hp <= 0 || !data) return;

        const { x, y, vx = 0 } = data;
        if (![x, y, vx].every(Number.isFinite)) return;
        if (x < 0 || x > WORLD_WIDTH * BLOCK_SIZE - BLOCK_SIZE ||
            y < 0 || y > WORLD_HEIGHT * BLOCK_SIZE - BLOCK_SIZE) return;

        // Server-Authoritative Solid Collision Validation (unless fly or noclip)
        if (!p.isAdmin && !p.noclip && !p.canFly) {
            if (Validator.isCollidingWithSolid(x, y, BLOCK_SIZE * 0.8, BLOCK_SIZE * 0.9, getBlock)) {
                return;
            }
        }

        const now = Date.now();
        const elapsed = Math.min(now - p.lastMoveAt, 250);
        const maxDistance = MOVE_DISTANCE_TOLERANCE + (MAX_PLAYER_SPEED * elapsed / 1000);
        if (Math.hypot(x - p.x, y - p.y) > maxDistance) return;

        p.x = x;
        p.y = y;
        p.vx = vx;
        p.lastMoveAt = now;
        // Emit player_moved to player's current chunk and neighbors
        const pcx = Math.floor((Math.floor(p.x / BLOCK_SIZE)) / CHUNK_SIZE);
        const pcy = Math.floor((Math.floor(p.y / BLOCK_SIZE)) / CHUNK_SIZE);
        emitToChunkNeighbors('player_moved', p, pcx, pcy, 1);

        const { newChunks } = playerManager.updatePlayerChunkVisibility(socket, p);
        if (newChunks && newChunks.length > 0) {
            socket.emit('chunks_loaded', { chunks: newChunks });
        }
    });

    // 🚪 Door Warp Teleportation Logic
    socket.on('enter_door', () => {
        if (!doorLimiter(socket.id)) return; // rate limit: 3/s
        const p = players[socket.id];
        if (!p || p.hp <= 0) return;

        const pgx = Math.floor((p.x + BLOCK_SIZE / 2) / BLOCK_SIZE);
        const pgy = Math.floor((p.y + BLOCK_SIZE / 2) / BLOCK_SIZE);

        // Check if player is standing in front of a Door block
        if (getBlock(pgx, pgy, 'background') === BLOCKS.DOOR || getBlock(pgx, pgy + 1, 'background') === BLOCKS.DOOR || getBlock(pgx, pgy - 1, 'background') === BLOCKS.DOOR) {
            const sourceDoor = getDoorAtOrNear(pgx, pgy);
            if (!sourceDoor) {
                socket.emit('server_message', 'This door has no pair ID. Replace it to register a pair.');
                return;
            }
            const targetDoor = getPairedDoor(sourceDoor);
            if (!targetDoor) {
                socket.emit('server_message', `Door ID ${sourceDoor.pairId} needs one matching door.`);
                return;
            }

            // Emit warp effect particles at current position
            sendToNearbyPlayers('door_warped', { x: p.x, y: p.y }, p.x, p.y);

            // Teleport player to target door
            p.x = targetDoor.x * BLOCK_SIZE;
            p.y = targetDoor.y * BLOCK_SIZE;
            p.lastMoveAt = Date.now();

            // Emit warp effect particles at destination
            sendToNearbyPlayers('door_warped', { x: p.x, y: p.y }, p.x, p.y);

            io.to(socket.id).emit('respawn', { x: p.x, y: p.y, hp: p.hp });

            const { newChunks } = playerManager.updatePlayerChunkVisibility(socket, p);
            if (newChunks && newChunks.length > 0) {
                socket.emit('chunks_loaded', { chunks: newChunks });
            }
            // Emit player_moved via chunk rooms
            const pcx = Math.floor((Math.floor(p.x / BLOCK_SIZE)) / CHUNK_SIZE);
            const pcy = Math.floor((Math.floor(p.y / BLOCK_SIZE)) / CHUNK_SIZE);
            emitToChunkNeighbors('player_moved', p, pcx, pcy, 1);
            socket.emit('server_message', `Warped through Door ID ${sourceDoor.pairId}.`);
        }
    });

    function checkRange(p, gx, gy) {
        if (p.isAdmin) return true;
        const px = p.x / BLOCK_SIZE;
        const py = p.y / BLOCK_SIZE;
        return Math.hypot(px - gx, py - gy) <= MAX_BUILD_RANGE;
    }

    socket.on('break_block', (data) => {
        if (!buildLimiter(socket.id)) return; // rate limit: 10/s
        if (!data) return;
        const { gridX, gridY } = data;
        const p = players[socket.id];
        if (!p || p.hp <= 0) return;
        
        // Input validation
        if (!Number.isInteger(gridX) || !Number.isInteger(gridY)) {
            logger.warn('Invalid block coordinates', { gridX, gridY, playerId: socket.id });
            return;
        }

        // Coordinate validation
        if (!Validator.isValidCoordinate(gridX, gridY, WORLD_WIDTH, WORLD_HEIGHT)) {
            fail(socket, 'That position is outside the world.');
            return;
        }

        if (!checkRange(p, gridX, gridY)) {
            fail(socket, 'Too far away to break that block.');
            return;
        }

        const foregroundBlock = getBlock(gridX, gridY);
        const backgroundBlock = getBlock(gridX, gridY, 'background');
        const layer = foregroundBlock !== BLOCKS.AIR ? 'foreground' : 'background';
        const oldBlock = layer === 'foreground' ? foregroundBlock : backgroundBlock;
        if (oldBlock !== BLOCKS.AIR) {
            if (oldBlock === BLOCKS.DOOR) doorEndpoints.delete(doorKey(gridX, gridY));
            setBlock(gridX, gridY, BLOCKS.AIR, layer);
            const roomKey = `chunk:${Math.floor(gridX / CHUNK_SIZE)},${Math.floor(gridY / CHUNK_SIZE)}`;
            io.to(roomKey).emit('world_update', { gridX, gridY, blockId: BLOCKS.AIR, layer });
            (async () => {
                try {
                    const sockets = await io.in(roomKey).allSockets();
                    logger.debug('world_update emitted', { 
                        type: 'break',
                        socketCount: sockets.size,
                        roomKey 
                    });
                } catch (e) { logger.error('Failed to list sockets', { error: e.message }); }
            })();
            spawnDroppedItem(oldBlock, gridX * BLOCK_SIZE + 8, gridY * BLOCK_SIZE + 8, 1);
            scheduleWorldSave();
        } else {
            fail(socket, 'There is no block there to break.');
        }
    });

    socket.on('place_block', (data) => {
        if (!buildLimiter(socket.id)) return; // rate limit: 10/s
        if (!data) return;
        const { gridX, gridY, blockId } = data;
        const p = players[socket.id];
        if (!p || p.hp <= 0) return;
        if (!Number.isInteger(gridX) || !Number.isInteger(gridY) || !VALID_BLOCK_IDS.has(blockId)) {
            fail(socket, 'That item cannot be placed.');
            return;
        }

        if (gridX >= 0 && gridX < WORLD_WIDTH && gridY >= 0 && gridY < WORLD_HEIGHT) {
            if (!checkRange(p, gridX, gridY)) {
                fail(socket, 'Too far away to place that block.');
                return;
            }

            if (!p.isAdmin) {
                if (!p.inventory[blockId] || p.inventory[blockId] <= 0) {
                    const blockName = Object.keys(BLOCKS).find(k => BLOCKS[k] === blockId) || 'Item';
                    fail(socket, `You do not have any ${blockName} left.`);
                    return;
                }
            }

            const layer = getPlacementLayer(blockId);
            if (getBlock(gridX, gridY, layer) === BLOCKS.AIR) {
                let placedDoor = null;
                if (blockId === BLOCKS.DOOR) placedDoor = assignDoorPair(gridX, gridY);
                setBlock(gridX, gridY, blockId, layer);
                if (!p.isAdmin) {
                    p.inventory[blockId]--;
                    socket.emit('inventory_update', p.inventory);
                }
                if ([BLOCKS.WOOD, BLOCKS.LEAVES, BLOCKS.WALL, BLOCKS.DOOR, BLOCKS.SOLID_WOOD_WALL, BLOCKS.SOLID_STONE_WALL].includes(blockId)) {
                    p.objectives[OBJECTIVE_IDS.BUILD_SHELTER] = true;
                    socket.emit('objective_event', { id: OBJECTIVE_IDS.BUILD_SHELTER });
                }
                const roomKey = `chunk:${Math.floor(gridX / CHUNK_SIZE)},${Math.floor(gridY / CHUNK_SIZE)}`;
                io.to(roomKey).emit('world_update', { gridX, gridY, blockId, layer });
                (async () => {
                    try {
                        const sockets = await io.in(roomKey).allSockets();
                        console.log(`[room] world_update (place) emitted to ${sockets.size} sockets in ${roomKey}:`, Array.from(sockets).slice(0, 10));
                    } catch (e) { console.error('[room] failed to list sockets', e); }
                })();
                scheduleWorldSave();
                if (placedDoor) {
                    socket.emit('server_message', `Door placed as ID ${placedDoor.pairId}. Place another door to complete this pair.`);
                }
            } else {
                fail(socket, layer === 'background' ? 'There is already a background block there.' : 'That space is already occupied.');
            }
        } else {
            fail(socket, 'That position is outside the world.');
        }
    });

    socket.on('drop_item', (data) => {
        if (!dropLimiter(socket.id)) return; // rate limit: 10/s
        const p = players[socket.id];
        if (!p || p.hp <= 0) return;
        if (!data || typeof data !== 'object') return;
        const { itemType } = data;

        if (!Number.isInteger(itemType) || !VALID_ITEM_IDS.has(itemType)) return;

        if (p.inventory[itemType] && p.inventory[itemType] > 0) {
            p.inventory[itemType]--;
            socket.emit('inventory_update', p.inventory);
            spawnDroppedItem(itemType, p.x + 8, p.y + 4, 1);
        }
    });

    socket.on('craft_item', (recipeId) => {
        if (!craftLimiter(socket.id)) return; // rate limit: 5/s
        const p = players[socket.id];
        if (!p || p.hp <= 0 || typeof recipeId !== 'string') return;
        const recipe = RECIPES[recipeId];
        if (!recipe) return;

        let canCraft = true;
        for (let ingId in recipe.ingredients) {
            const reqAmount = recipe.ingredients[ingId];
            if (!p.inventory[ingId] || p.inventory[ingId] < reqAmount) {
                canCraft = false;
                break;
            }
        }

        if (canCraft) {
            for (let ingId in recipe.ingredients) {
                p.inventory[ingId] -= recipe.ingredients[ingId];
            }
            p.inventory[recipe.result] = (p.inventory[recipe.result] || 0) + recipe.amount;
            socket.emit('inventory_update', p.inventory);
            if (recipe.result === ITEMS.WOODEN_SWORD || recipe.result === ITEMS.STONE_SWORD) {
                socket.emit('objective_event', { id: OBJECTIVE_IDS.CRAFT_SWORD });
            }
            socket.emit('server_message', `🛠️ Crafted ${recipe.amount}x item!`);
        } else {
            socket.emit('server_message', `❌ Insufficient materials to craft!`);
        }
    });

    socket.on('attack_mob', (data) => {
        if (!attackLimiter(socket.id)) return; // rate limit: 10/s
        const p = players[socket.id];
        if (!p || p.hp <= 0) return;
        if (!data || typeof data !== 'object') return;
        const { mobId, weaponId } = data;
        
        if (!Number.isInteger(mobId) || !Number.isInteger(weaponId)) return;

        const mobIndex = mobs.findIndex(m => m.id === mobId);
        if (mobIndex === -1) return;
        const mob = mobs[mobIndex];

        const dist = Math.hypot(p.x - mob.x, p.y - mob.y);
        if (dist > 3 * BLOCK_SIZE) return;

        const damage = combatSystem.calculateWeaponDamage(weaponId, p.inventory, ITEMS);

        mob.hp -= damage;
        mob.vx = (mob.x > p.x ? 1 : -1) * 5;
        mob.vy = -3;

        const mcx = Math.floor((Math.floor(mob.x / BLOCK_SIZE)) / CHUNK_SIZE);
        const mcy = Math.floor((Math.floor(mob.y / BLOCK_SIZE)) / CHUNK_SIZE);
        emitToChunkNeighbors('mob_damaged', { mobId: mob.id, hp: mob.hp, maxHp: mob.maxHp, damage }, mcx, mcy, 1);

        if (mob.hp <= 0) {
            spawnDroppedItem(BLOCKS.STONE, mob.x, mob.y, 2);
            spawnDroppedItem(BLOCKS.WOOD, mob.x + 8, mob.y, 1);
            mobs.splice(mobIndex, 1);
            const roomKey = `${Math.floor((Math.floor((mob.x + 16) / BLOCK_SIZE) / CHUNK_SIZE))},${Math.floor((Math.floor((mob.y + 32) / BLOCK_SIZE) / CHUNK_SIZE))}`;
            io.to(`chunk:${roomKey}`).emit('mob_died', { mobId: mob.id });
        }
    });

    socket.on('chat_message', (msg) => {
        const player = players[socket.id];
        if (!player || typeof msg !== 'string') return;
        
        // Sanitize message
        msg = Validator.sanitizeMessage(msg);
        if (!msg) return;

        // Rate limiting for chat (max 5 messages per 5 seconds)
        if (!player.lastChatTime) player.lastChatTime = 0;
        const now = Date.now();
        if (now - player.lastChatTime < 1000) {
            socket.emit('server_message', '⏱️ Slow down! Chat rate limit.');
            return;
        }
        player.lastChatTime = now;

        if (msg.startsWith('/')) {
            const args = msg.split(' ');
            const command = args[0].toLowerCase();

            if (command === '/loginadmin') {
                if (!ADMIN_PASSWORD) {
                    socket.emit('server_message', 'Admin login is disabled. Set ADMIN_PASSWORD on the server first.');
                    return;
                }
                if (args[1] !== ADMIN_PASSWORD) {
                    logger.warn('Failed admin login attempt', { playerId: socket.id });
                    socket.emit('server_message', 'Invalid admin password.');
                    return;
                }
                player.isAdmin = true;
                socket.emit('server_message', '🛡️ You are now an ADMIN! Range limit removed & Mob immunity active.');
                socket.emit('admin_status', { isAdmin: player.isAdmin, canFly: player.canFly, noclip: player.noclip });
                return;
            }
            if (command === '/logoutadmin') {
                if (!player.isAdmin) {
                    socket.emit('server_message', 'You are already a regular player.');
                    return;
                }
                player.isAdmin = false;
                player.canFly = false;
                player.noclip = false;
                socket.emit('admin_status', { isAdmin: player.isAdmin, canFly: player.canFly, noclip: player.noclip });
                sendToNearbyPlayers('player_moved', player, player.x, player.y);
                socket.emit('server_message', 'Admin mode disabled. You are now a regular player.');
                return;
            }
            if (command === '/fly') {
                if (player.isAdmin) {
                    player.canFly = !player.canFly;
                    socket.emit('admin_status', { isAdmin: player.isAdmin, canFly: player.canFly, noclip: player.noclip });
                    socket.emit('server_message', `✈️ Fly mode: ${player.canFly ? 'ON' : 'OFF'}`);
                } else { socket.emit('server_message', '❌ Admin only.'); }
                return;
            }
            if (command === '/noclip') {
                if (player.isAdmin) {
                    player.noclip = !player.noclip;
                    socket.emit('admin_status', { isAdmin: player.isAdmin, canFly: player.canFly, noclip: player.noclip });
                    socket.emit('server_message', `👻 Noclip mode: ${player.noclip ? 'ON' : 'OFF'}`);
                } else { socket.emit('server_message', '❌ Admin only.'); }
                return;
            }
            if (command === '/give') {
                if (player.isAdmin && args[1] && args[2]) {
                    const item = Number(args[1]);
                    const qty = Number(args[2]);
                    if (!Number.isInteger(item) || !VALID_ITEM_IDS.has(item)) {
                        socket.emit('server_message', 'Invalid item ID.');
                        return;
                    }
                    if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
                        socket.emit('server_message', 'Quantity must be a whole number from 1 to 999.');
                        return;
                    }
                    player.inventory[item] = (player.inventory[item] || 0) + qty;
                    socket.emit('inventory_update', player.inventory);
                    socket.emit('server_message', `🎁 Given ${qty}x item(s)`);
                } else if (!player.isAdmin) { socket.emit('server_message', '❌ Admin only.'); }
                return;
            }
        }

        io.emit('chat_message', { id: socket.id, username: player.username, color: player.color, text: msg });
    });

    socket.on('disconnect', (reason) => {
        console.log(`[-] Player disconnected: ${socket.id}`);
        // Immediately notify other clients so the player disappears from their screens.
        // NetworkHandler.handleDisconnect keeps the player entry alive during the
        // reconnect window; it will emit 'player_left' itself only after the timeout.
        if (players[socket.id]) io.emit('player_left', socket.id);
        // Delegate cleanup & reconnect-window bookkeeping to NetworkHandler
        networkHandler.handleDisconnect(socket, socket.id)(reason);
    });
});

// PORT is imported from gameConfig
try {
    server.listen(PORT, () => {
        logger.info('Server started successfully', { 
            port: PORT,
            env: process.env.NODE_ENV || 'development'
        });
        
        // Log health check endpoint
        app.get('/health', (req, res) => {
            res.json(networkHandler.getHealth());
        });
    });
} catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
}
