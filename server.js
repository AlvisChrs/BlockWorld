const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const ChunkManager = require('./world/ChunkManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Game Constants
const WORLD_WIDTH = 100;
const WORLD_HEIGHT = 50;
const BLOCK_SIZE = 32;
const CHUNK_SIZE = 32; // Tiles per chunk (32x32 tiles)
const MAX_HP = 20;
const LAVA_DAMAGE_INTERVAL = 500;
const HP_REGEN_INTERVAL = 5000;
const MAX_BUILD_RANGE = 4;
const MAX_PLAYER_SPEED = 900; // pixels/second; allows normal falling while rejecting teleports
const MOVE_DISTANCE_TOLERANCE = 48;
const PLAYER_RESPAWN_DELAY = 3000;
const MOB_JUMP_FORCE = -5.5;
const MOB_MAX_JUMP_HEIGHT = BLOCK_SIZE * 1.25;
const MOB_MAX_COUNT = 2;
const MOB_SPAWN_INTERVAL = 25000;
const SAVE_INTERVAL = 30000;
const DATA_DIR = path.join(__dirname, 'data');
const WORLD_SAVE_PATH = path.join(DATA_DIR, 'world-state.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// Day / Night Cycle Constants (Total 120s: 60s Day, 60s Night)
const CYCLE_DURATION = 120;
let gameTime = 0;

// Block & Item IDs
const BLOCKS = {
    AIR: 0,
    DIRT: 1,
    GRASS: 2,
    STONE: 3,
    WOOD: 4,
    LEAVES: 5,
    GLASS: 6,
    LAVA: 7,
    ICE: 8,
    WALL: 9,              // Background Wall
    DOOR: 10,            // Background Door
    SPIKE: 11,           // Deadly Spike
    SOLID_WOOD_WALL: 12, // Solid Wood Wall
    SOLID_STONE_WALL: 13 // Solid Stone Wall
};

const ITEMS = {
    WOODEN_SWORD: 101,
    STONE_SWORD: 102
};

// Crafting Recipes
const RECIPES = {
    'solid_wood_wall': { result: BLOCKS.SOLID_WOOD_WALL, amount: 1, ingredients: { [BLOCKS.WOOD]: 2 } },
    'solid_stone_wall': { result: BLOCKS.SOLID_STONE_WALL, amount: 1, ingredients: { [BLOCKS.STONE]: 2 } },
    'wooden_door':      { result: BLOCKS.DOOR,             amount: 1, ingredients: { [BLOCKS.WOOD]: 4 } },
    'wooden_sword':     { result: ITEMS.WOODEN_SWORD,      amount: 1, ingredients: { [BLOCKS.WOOD]: 3 } },
    'stone_sword':      { result: ITEMS.STONE_SWORD,       amount: 1, ingredients: { [BLOCKS.WOOD]: 2, [BLOCKS.STONE]: 2 } }
};

const isBackground = (id) => [
    BLOCKS.AIR, BLOCKS.WALL, BLOCKS.DOOR
].includes(id);

const VALID_BLOCK_IDS = new Set(Object.values(BLOCKS).filter(id => id !== BLOCKS.AIR));
const VALID_ITEM_IDS = new Set([...VALID_BLOCK_IDS, ...Object.values(ITEMS)]);
const BACKGROUND_BLOCK_IDS = new Set([BLOCKS.WALL, BLOCKS.DOOR]);
const OBJECTIVE_IDS = {
    COLLECT_WOOD: 'collect_wood',
    CRAFT_SWORD: 'craft_sword',
    BUILD_SHELTER: 'build_shelter',
    SURVIVE_NIGHT: 'survive_night'
};

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

// Game State Containers
const players = {};
let droppedItems = [];
let mobs = [];
let nextItemId = 1;
let nextMobId = 1;
// Door blocks only store their visual type in `world`, so keep their pair ID separately.
const doorEndpoints = new Map();

// Chunk Manager for bandwidth optimization
let chunkManager = null;

function isValidWorldGrid(candidate) {
    return Array.isArray(candidate) &&
        candidate.length === WORLD_HEIGHT &&
        candidate.every(row =>
            Array.isArray(row) &&
            row.length === WORLD_WIDTH &&
            row.every(blockId => Number.isInteger(blockId) && Object.values(BLOCKS).includes(blockId))
        );
}

function splitLegacyWorldGrid(savedWorld) {
    world = createEmptyGrid();
    backgroundWorld = createEmptyGrid();

    for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let x = 0; x < WORLD_WIDTH; x++) {
            const blockId = savedWorld[y][x];
            if (BACKGROUND_BLOCK_IDS.has(blockId)) backgroundWorld[y][x] = blockId;
            else world[y][x] = blockId;
        }
    }
}

function serializeDoorEndpoints() {
    return Array.from(doorEndpoints.values());
}

function restoreDoorEndpoints(savedDoors) {
    doorEndpoints.clear();
    if (!Array.isArray(savedDoors)) return;

    for (const door of savedDoors) {
        if (!door || !Number.isInteger(door.x) || !Number.isInteger(door.y) || !Number.isInteger(door.pairId)) continue;
        if (door.x < 0 || door.x >= WORLD_WIDTH || door.y < 0 || door.y >= WORLD_HEIGHT) continue;
        if (getBlock(door.x, door.y, 'background') !== BLOCKS.DOOR) continue;
        doorEndpoints.set(doorKey(door.x, door.y), { x: door.x, y: door.y, pairId: door.pairId });
    }
}

function loadWorldState() {
    try {
        if (!fs.existsSync(WORLD_SAVE_PATH)) {
            generateNaturalWorld();
            return;
        }

        const saved = JSON.parse(fs.readFileSync(WORLD_SAVE_PATH, 'utf8'));
        if (isValidWorldGrid(saved.foregroundWorld) && isValidWorldGrid(saved.backgroundWorld)) {
            world = saved.foregroundWorld;
            backgroundWorld = saved.backgroundWorld;
        } else if (isValidWorldGrid(saved.world)) {
            splitLegacyWorldGrid(saved.world);
        } else {
            console.warn('[save] Invalid saved world shape. Generating a new world.');
            generateNaturalWorld();
            return;
        }
        droppedItems = Array.isArray(saved.droppedItems) ? saved.droppedItems.filter(item =>
            item &&
            Number.isInteger(item.id) &&
            VALID_ITEM_IDS.has(item.itemType) &&
            Number.isFinite(item.x) &&
            Number.isFinite(item.y) &&
            Number.isInteger(item.amount) &&
            item.amount > 0
        ) : [];
        nextItemId = Number.isInteger(saved.nextItemId) && saved.nextItemId > 0 ? saved.nextItemId : 1;
        restoreDoorEndpoints(saved.doorEndpoints);
        console.log(`[save] Loaded world state from ${WORLD_SAVE_PATH}`);
    } catch (err) {
        console.error('[save] Failed to load world state. Generating a new world.', err);
        generateNaturalWorld();
    }
}

let saveTimer = null;
let saveInProgress = false;
let savePending = false;

function saveWorldState() {
    if (saveInProgress) {
        savePending = true;
        return;
    }

    saveInProgress = true;
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        const payload = {
            version: 1,
            savedAt: new Date().toISOString(),
            foregroundWorld: world,
            backgroundWorld,
            doorEndpoints: serializeDoorEndpoints(),
            droppedItems,
            nextItemId
        };
        fs.writeFileSync(WORLD_SAVE_PATH, JSON.stringify(payload, null, 2));
    } catch (err) {
        console.error('[save] Failed to save world state.', err);
    } finally {
        saveInProgress = false;
        if (savePending) {
            savePending = false;
            saveWorldState();
        }
    }
}

function scheduleWorldSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        saveWorldState();
    }, 1000);
}

function shutdown(signal) {
    console.log(`[save] ${signal} received. Saving world state before exit.`);
    if (saveTimer) clearTimeout(saveTimer);
    saveWorldState();
    process.exit(0);
}

loadWorldState();

// Initialize chunk manager from loaded world
chunkManager = new ChunkManager(WORLD_WIDTH, WORLD_HEIGHT, CHUNK_SIZE);
chunkManager.initializeFromWorld(world, backgroundWorld);
console.log(`[chunks] Initialized ${chunkManager.chunksX}x${chunkManager.chunksY} chunk grid`);

setInterval(saveWorldState, SAVE_INTERVAL);
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
    // Some callers already reduce HP to zero; `isDead` is the one-time guard.
    if (!p || p.isDead) return;
    p.hp = 0;
    p.isDead = true;
    p.deathSequence = (p.deathSequence || 0) + 1;
    io.to(p.id).emit('hp_update', p.hp);
    io.emit('player_died', { id: p.id, reason });
    
    setTimeout(() => {
        const player = players[p.id];
        if (player && player.isDead && player.deathSequence === p.deathSequence) {
            player.hp = MAX_HP;
            player.x = 10 * BLOCK_SIZE;
            player.y = 15 * BLOCK_SIZE;
            player.vx = 0;
            player.isDead = false;
            player.lastDamageTime = 0;
            player.lastMoveAt = Date.now();
            io.to(p.id).emit('respawn', { x: player.x, y: player.y, hp: MAX_HP });
            io.emit('player_moved', player);
        }
    }, PLAYER_RESPAWN_DELAY);
}

// ─── Day / Night Cycle Timer (120s loop) ──────────────────────────────────────
setInterval(() => {
    gameTime = (gameTime + 1) % CYCLE_DURATION;
    const isNight = gameTime >= 60;

    io.emit('time_sync', { gameTime, isNight });

    if (gameTime === 0 && mobs.length > 0) {
        mobs = [];
        io.emit('mobs_update', mobs);
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
    for (let id in players) {
        const p = players[id];
        if (p.hp <= 0) continue;

        const gridX = Math.floor((p.x + BLOCK_SIZE * 0.4) / BLOCK_SIZE);
        const gridY = Math.floor((p.y + BLOCK_SIZE - 4) / BLOCK_SIZE);
        const blockUnder = getBlock(gridX, gridY);
        const blockAt = getBlock(gridX, Math.floor((p.y + BLOCK_SIZE / 2) / BLOCK_SIZE));

        if (blockUnder === BLOCKS.SPIKE || blockAt === BLOCKS.SPIKE) {
            handleDeath(p, io, 'spike');
            continue;
        }

        if (blockUnder === BLOCKS.LAVA || blockAt === BLOCKS.LAVA) {
            p.hp = Math.max(0, p.hp - 1);
            p.lastDamageTime = Date.now();
            io.to(id).emit('hp_update', p.hp);
            if (p.hp === 0) handleDeath(p, io, 'lava');
        }
    }
}, LAVA_DAMAGE_INTERVAL);

// ─── Ticker 2: HP Regen ──────────────────────────────────────────────────────
setInterval(() => {
    const now = Date.now();
    for (let id in players) {
        const p = players[id];
        if (p.hp > 0 && p.hp < MAX_HP) {
            if (!p.lastDamageTime || now - p.lastDamageTime > 3000) {
                p.hp++;
                io.to(id).emit('hp_update', p.hp);
            }
        }
    }
}, HP_REGEN_INTERVAL);

// ─── Ticker 3: Dropped Items Physics & Auto-Pickup ────────────────────────────
setInterval(() => {
    for (let i = droppedItems.length - 1; i >= 0; i--) {
        const item = droppedItems[i];
        if (item.vy < 4) item.vy += 0.4;
        item.y += item.vy;

        const gx = Math.floor(item.x / BLOCK_SIZE);
        const gy = Math.floor((item.y + 12) / BLOCK_SIZE);
        if (getBlock(gx, gy) !== BLOCKS.AIR) {
            item.y = gy * BLOCK_SIZE - 12;
            item.vy = 0;
        }

        const now = Date.now();
        if (now - item.spawnTime > 500) {
            for (let id in players) {
                const p = players[id];
                if (p.hp <= 0) continue;

                const dist = Math.hypot((p.x + BLOCK_SIZE/2) - item.x, (p.y + BLOCK_SIZE/2) - item.y);
                if (dist < 40) {
                    p.inventory[item.itemType] = (p.inventory[item.itemType] || 0) + item.amount;
                    io.to(id).emit('inventory_update', p.inventory);
                    io.emit('item_picked_up', { itemId: item.id, playerId: id });
                    droppedItems.splice(i, 1);
                    break;
                }
            }
        }
    }
}, 50);

// ─── Ticker 4: Knight Mob Spawner (NIGHT TIME ONLY!) & AI Loop ────────────────
setInterval(() => {
    const isNight = gameTime >= 60;
    if (isNight && mobs.length < MOB_MAX_COUNT) {
        const playerIds = Object.keys(players).filter(id => players[id].hp > 0 && !players[id].isAdmin);
        if (playerIds.length > 0) {
            const randomPlayer = players[playerIds[Math.floor(Math.random() * playerIds.length)]];
            const spawnDir = Math.random() < 0.5 ? -1 : 1;
            const spawnGx = Math.floor(randomPlayer.x / BLOCK_SIZE) + spawnDir * (8 + Math.floor(Math.random() * 4));
            
            if (spawnGx >= 2 && spawnGx < WORLD_WIDTH - 2) {
                let spawnGy = 20;
                spawnGy = findSurfaceY(spawnGx) - 1;

                const newMob = {
                    id: nextMobId++,
                    x: spawnGx * BLOCK_SIZE,
                    y: spawnGy * BLOCK_SIZE,
                    vx: 0,
                    vy: 0,
                    hp: 15,
                    maxHp: 15,
                    attackCooldown: 0,
                    facingRight: true
                };
                mobs.push(newMob);
                io.emit('mob_spawned', newMob);
            }
        }
    }
}, MOB_SPAWN_INTERVAL);

// Mob Physics & AI Update (20 FPS)
setInterval(() => {
    for (let i = mobs.length - 1; i >= 0; i--) {
        const mob = mobs[i];
        if (mob.hp <= 0) continue;

        let closestPlayer = null;
        let minDist = 12 * BLOCK_SIZE;

        for (let id in players) {
            const p = players[id];
            if (p.hp <= 0 || p.isAdmin) continue;

            const d = Math.hypot(p.x - mob.x, p.y - mob.y);
            if (d < minDist) {
                minDist = d;
                closestPlayer = p;
            }
        }

        if (closestPlayer) {
            if (closestPlayer.x > mob.x + 8) { mob.vx = 2.5; mob.facingRight = true; }
            else if (closestPlayer.x < mob.x - 8) { mob.vx = -2.5; mob.facingRight = false; }
            else mob.vx = 0;

            const frontX = mob.x + (mob.vx > 0 ? BLOCK_SIZE : -4);
            const frontBlock = getBlock(Math.floor(frontX / BLOCK_SIZE), Math.floor((mob.y + 16) / BLOCK_SIZE));
            if (frontBlock !== BLOCKS.AIR && mob.vy === 0) {
                mob.vy = MOB_JUMP_FORCE;
                mob.jumpStartY = mob.y;
            }

            if (mob.attackCooldown > 0) mob.attackCooldown--;
            if (minDist < 42 && mob.attackCooldown <= 0) {
                mob.attackCooldown = 30;
                closestPlayer.hp = Math.max(0, closestPlayer.hp - 2);
                closestPlayer.lastDamageTime = Date.now();
                io.to(closestPlayer.id).emit('hp_update', closestPlayer.hp);
                io.emit('mob_attack', { mobId: mob.id, targetId: closestPlayer.id, damage: 2 });
                if (closestPlayer.hp === 0) handleDeath(closestPlayer, io, 'knight');
            }
        } else {
            mob.vx *= 0.8;
            if (Math.abs(mob.vx) < 0.1) mob.vx = 0;
        }

        mob.vy = Math.min(mob.vy + 0.5, 12);
        mob.x += mob.vx;
        mob.y += mob.vy;
        if (mob.jumpStartY !== undefined && mob.y < mob.jumpStartY - MOB_MAX_JUMP_HEIGHT) {
            mob.y = mob.jumpStartY - MOB_MAX_JUMP_HEIGHT;
            mob.vy = 0;
        }

        const mobGx = Math.floor((mob.x + 16) / BLOCK_SIZE);
        const mobGy = Math.floor((mob.y + 32) / BLOCK_SIZE);
        const bBelow = getBlock(mobGx, mobGy);
        if (bBelow !== BLOCKS.AIR) {
            mob.y = (mobGy - 1) * BLOCK_SIZE;
            mob.vy = 0;
            delete mob.jumpStartY;
        }

        mob.x = Math.max(0, Math.min(mob.x, (WORLD_WIDTH - 1) * BLOCK_SIZE));
    }
    io.emit('mobs_update', mobs);
}, 50);

// ─── Socket Events ────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`[+] Player connected: ${socket.id}`);
    const username = sanitizeUsername(socket.handshake.auth?.username);

    const starterInventory = {
        [BLOCKS.DIRT]: 20,
        [BLOCKS.GRASS]: 10,
        [BLOCKS.STONE]: 15,
        [BLOCKS.WOOD]: 10,
        [BLOCKS.LEAVES]: 10,
        [BLOCKS.GLASS]: 5,
        [BLOCKS.LAVA]: 5,
        [BLOCKS.ICE]: 5,
        [BLOCKS.SPIKE]: 8,
        [BLOCKS.DOOR]: 4 // Provide doors to test Door Warp!
    };

    players[socket.id] = {
        id: socket.id,
        username,
        x: 10 * BLOCK_SIZE,
        y: 15 * BLOCK_SIZE,
        vx: 0,
        color: '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0'),
        isAdmin: false,
        canFly: false,
        noclip: false,
        hp: MAX_HP,
        lastDamageTime: 0,
        lastMoveAt: Date.now(),
        inventory: starterInventory,
        objectives: {
            [OBJECTIVE_IDS.BUILD_SHELTER]: false,
            [OBJECTIVE_IDS.SURVIVE_NIGHT]: false
        },
        visibleChunks: new Set() // Track loaded chunks for this player
    };

    const player = players[socket.id];
    const playerGridX = Math.floor(player.x / BLOCK_SIZE);
    const playerGridY = Math.floor(player.y / BLOCK_SIZE);
    const visibleChunks = chunkManager.getVisibleChunks(playerGridX, playerGridY, 1024, 768);
    const serializedChunks = [];
    
    for (const chunk of visibleChunks) {
        serializedChunks.push(chunkManager.serializeChunk(chunk.chunkX, chunk.chunkY, 'foreground'));
        serializedChunks.push(chunkManager.serializeChunk(chunk.chunkX, chunk.chunkY, 'background'));
        player.visibleChunks.add(`${chunk.chunkX},${chunk.chunkY}`);
    }

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
        inventory: starterInventory,
        gameTime: gameTime,
        isNight: gameTime >= 60
    });

    socket.broadcast.emit('player_joined', players[socket.id]);

    socket.on('player_move', (data) => {
        const p = players[socket.id];
        if (!p || p.hp <= 0 || !data) return;

        const { x, y, vx = 0 } = data;
        if (![x, y, vx].every(Number.isFinite)) return;
        if (x < 0 || x > WORLD_WIDTH * BLOCK_SIZE - BLOCK_SIZE ||
            y < 0 || y > WORLD_HEIGHT * BLOCK_SIZE - BLOCK_SIZE) return;

        const now = Date.now();
        const elapsed = Math.min(now - p.lastMoveAt, 250);
        const maxDistance = MOVE_DISTANCE_TOLERANCE + (MAX_PLAYER_SPEED * elapsed / 1000);
        if (Math.hypot(x - p.x, y - p.y) > maxDistance) return;

        p.x = x;
        p.y = y;
        p.vx = vx;
        p.lastMoveAt = now;
        socket.broadcast.emit('player_moved', p);

        // Check if player moved to different chunks and send new chunks
        const playerGridX = Math.floor(p.x / BLOCK_SIZE);
        const playerGridY = Math.floor(p.y / BLOCK_SIZE);
        const visibleChunks = chunkManager.getVisibleChunks(playerGridX, playerGridY, 1024, 768);
        const newChunkKeys = new Set();
        const newChunks = [];

        for (const chunk of visibleChunks) {
            const key = `${chunk.chunkX},${chunk.chunkY}`;
            newChunkKeys.add(key);
            
            if (!p.visibleChunks.has(key)) {
                newChunks.push(chunkManager.serializeChunk(chunk.chunkX, chunk.chunkY, 'foreground'));
                newChunks.push(chunkManager.serializeChunk(chunk.chunkX, chunk.chunkY, 'background'));
            }
        }

        if (newChunks.length > 0) {
            socket.emit('chunks_loaded', { chunks: newChunks });
        }
        
        p.visibleChunks = newChunkKeys;
    });

    // 🚪 Door Warp Teleportation Logic
    socket.on('enter_door', () => {
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
            io.emit('door_warped', { x: p.x, y: p.y });

            // Teleport player to target door
            p.x = targetDoor.x * BLOCK_SIZE;
            p.y = targetDoor.y * BLOCK_SIZE;
            p.lastMoveAt = Date.now();

            // Emit warp effect particles at destination
            io.emit('door_warped', { x: p.x, y: p.y });

            io.to(socket.id).emit('respawn', { x: p.x, y: p.y, hp: p.hp });
            io.emit('player_moved', p);
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
        if (!data) return;
        const { gridX, gridY } = data;
        const p = players[socket.id];
        if (!p || p.hp <= 0) return;
        if (!Number.isInteger(gridX) || !Number.isInteger(gridY)) return;

        if (gridX >= 0 && gridX < WORLD_WIDTH && gridY >= 0 && gridY < WORLD_HEIGHT) {
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
                io.emit('world_update', { gridX, gridY, blockId: BLOCKS.AIR, layer });
                spawnDroppedItem(oldBlock, gridX * BLOCK_SIZE + 8, gridY * BLOCK_SIZE + 8, 1);
                scheduleWorldSave();
            } else {
                fail(socket, 'There is no block there to break.');
            }
        }
    });

    socket.on('place_block', (data) => {
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
                    fail(socket, `You do not have any ${blockId} left.`);
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
                io.emit('world_update', { gridX, gridY, blockId, layer });
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
        const p = players[socket.id];
        if (!p || p.hp <= 0) return;
        if (!data) return;
        const { itemType } = data;

        if (!VALID_ITEM_IDS.has(itemType)) return;

        if (p.inventory[itemType] && p.inventory[itemType] > 0) {
            p.inventory[itemType]--;
            socket.emit('inventory_update', p.inventory);
            spawnDroppedItem(itemType, p.x + 8, p.y + 4, 1);
        }
    });

    socket.on('craft_item', (recipeId) => {
        const p = players[socket.id];
        if (!p || p.hp <= 0) return;
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
        const p = players[socket.id];
        if (!p || p.hp <= 0) return;
        if (!data) return;
        const { mobId, weaponId } = data;

        const mobIndex = mobs.findIndex(m => m.id === mobId);
        if (mobIndex === -1) return;
        const mob = mobs[mobIndex];

        const dist = Math.hypot(p.x - mob.x, p.y - mob.y);
        if (dist > 3 * BLOCK_SIZE) return;

        let damage = 1;
        if (weaponId === ITEMS.WOODEN_SWORD && p.inventory[ITEMS.WOODEN_SWORD] > 0) damage = 3;
        if (weaponId === ITEMS.STONE_SWORD && p.inventory[ITEMS.STONE_SWORD] > 0) damage = 5;

        mob.hp -= damage;
        mob.vx = (mob.x > p.x ? 1 : -1) * 5;
        mob.vy = -3;

        io.emit('mob_damaged', { mobId: mob.id, hp: mob.hp, maxHp: mob.maxHp, damage });

        if (mob.hp <= 0) {
            spawnDroppedItem(BLOCKS.STONE, mob.x, mob.y, 2);
            spawnDroppedItem(BLOCKS.WOOD, mob.x + 8, mob.y, 1);
            mobs.splice(mobIndex, 1);
            io.emit('mob_died', { mobId: mob.id });
        }
    });

    socket.on('chat_message', (msg) => {
        const player = players[socket.id];
        if (!player || typeof msg !== 'string') return;
        msg = msg.trim().slice(0, 300);
        if (!msg) return;

        if (msg.startsWith('/')) {
            const args = msg.split(' ');
            const command = args[0].toLowerCase();

            if (command === '/loginadmin') {
                if (!ADMIN_PASSWORD) {
                    socket.emit('server_message', 'Admin login is disabled. Set ADMIN_PASSWORD on the server first.');
                    return;
                }
                if (args[1] !== ADMIN_PASSWORD) {
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
                io.emit('player_moved', player);
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
                    socket.emit('server_message', `🎁 Given ${qty}x item ID ${item}`);
                } else if (!player.isAdmin) { socket.emit('server_message', '❌ Admin only.'); }
                return;
            }
        }

        io.emit('chat_message', { id: socket.id, username: player.username, color: player.color, text: msg });
    });

    socket.on('disconnect', () => {
        console.log(`[-] Player disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('player_left', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`BlockWorld Alpha Server running on http://localhost:${PORT}`);
});
