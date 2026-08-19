const { parentPort } = require('worker_threads');

let TICK_MS = 50;
let BLOCK_SIZE = 32;
let CHUNK_SIZE = 32;
let WORLD_WIDTH = 100;
let WORLD_HEIGHT = 50;

let lastSnapshot = { mobs: [], droppedItems: [], players: {}, world: [], backgroundWorld: [] };

parentPort.on('message', (msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'config') {
        if (msg.tickMs) TICK_MS = msg.tickMs;
        if (msg.BLOCK_SIZE) BLOCK_SIZE = msg.BLOCK_SIZE;
        if (msg.CHUNK_SIZE) CHUNK_SIZE = msg.CHUNK_SIZE;
        if (msg.WORLD_WIDTH) WORLD_WIDTH = msg.WORLD_WIDTH;
        if (msg.WORLD_HEIGHT) WORLD_HEIGHT = msg.WORLD_HEIGHT;
    }
    if (msg.type === 'snapshot') {
        lastSnapshot = {
            mobs: Array.isArray(msg.mobs) ? msg.mobs.map(m => Object.assign({}, m)) : [],
            droppedItems: Array.isArray(msg.droppedItems) ? msg.droppedItems.map(i => Object.assign({}, i)) : [],
            players: Object.assign({}, msg.players || {}),
            world: Array.isArray(msg.world) ? msg.world : [],
            backgroundWorld: Array.isArray(msg.backgroundWorld) ? msg.backgroundWorld : []
        };
    }
});

function isSolidAtWorld(worldGrid, gx, gy) {
    if (!worldGrid || !Array.isArray(worldGrid) || gy < 0 || gy >= worldGrid.length || gx < 0 || gx >= (worldGrid[0] ? worldGrid[0].length : 0)) return false;
    const id = worldGrid[gy][gx];
    return id !== 0; // 0 is AIR
}

function distance(a,b){ return Math.hypot(a.x - b.x, a.y - b.y); }

setInterval(() => {
    const mobs = lastSnapshot.mobs || [];
    const items = lastSnapshot.droppedItems || [];
    const players = lastSnapshot.players || {};
    const worldGrid = lastSnapshot.world || [];
    const events = [];

    // Update items physics and pick up
    const remainingItems = [];
    for (const item of items) {
        if (typeof item.vy !== 'number') item.vy = 0;
        if (item.vy < 4) item.vy += 0.4;
        item.y += item.vy;

        const gx = Math.floor(item.x / BLOCK_SIZE);
        const gy = Math.floor((item.y + 12) / BLOCK_SIZE);
        if (isSolidAtWorld(worldGrid, gx, gy)) {
            item.y = gy * BLOCK_SIZE - 12;
            item.vy = 0;
        }

        // pickup
        let picked = false;
        for (const pid in players) {
            const p = players[pid];
            if (!p || p.hp <= 0) continue;
            const dist = Math.hypot((p.x + BLOCK_SIZE/2) - item.x, (p.y + BLOCK_SIZE/2) - item.y);
            if (dist < 40) {
                events.push({ type: 'item_picked_up', itemId: item.id, playerId: pid, itemType: item.itemType, amount: item.amount, x: item.x, y: item.y });
                picked = true; break;
            }
        }
        if (!picked) remainingItems.push(item);
    }

    // Update mobs: simple AI + physics
    const updatedMobs = [];
    for (const mob of mobs) {
        if (typeof mob.vx !== 'number') mob.vx = 0;
        if (typeof mob.vy !== 'number') mob.vy = 0;
        if (typeof mob.attackCooldown !== 'number') mob.attackCooldown = 0;

        // find closest player
        let closest = null; let minD = Infinity;
        for (const pid in players) {
            const p = players[pid];
            if (!p || p.hp <= 0 || p.isAdmin) continue;
            const d = Math.hypot(p.x - mob.x, p.y - mob.y);
            if (d < minD) { minD = d; closest = Object.assign({}, p); }
        }

        if (closest && minD < 12 * BLOCK_SIZE) {
            mob.vx = closest.x > mob.x + 8 ? 2.5 : (closest.x < mob.x - 8 ? -2.5 : 0);
            if (minD < 42 && mob.attackCooldown <= 0) {
                mob.attackCooldown = 30;
                events.push({ type: 'mob_attack', mobId: mob.id, targetId: closest.id, damage: 2, x: mob.x, y: mob.y });
            }
        } else {
            mob.vx *= 0.8;
            if (Math.abs(mob.vx) < 0.1) mob.vx = 0;
        }

        // jump attempt if front blocked
        const frontX = mob.x + (mob.vx > 0 ? BLOCK_SIZE : -4);
        const frontGx = Math.floor(frontX / BLOCK_SIZE);
        const frontGy = Math.floor((mob.y + 16) / BLOCK_SIZE);
        if (isSolidAtWorld(worldGrid, frontGx, frontGy) && mob.vy === 0) {
            mob.vy = -5.5; // MOB_JUMP_FORCE
            mob.jumpStartY = mob.y;
        }

        if (mob.attackCooldown > 0) mob.attackCooldown--;

        // physics
        mob.vy = Math.min(mob.vy + 0.5, 12);
        mob.x += mob.vx;
        mob.y += mob.vy;

        if (mob.jumpStartY !== undefined && mob.y < mob.jumpStartY - (BLOCK_SIZE * 1.25)) {
            mob.y = mob.jumpStartY - (BLOCK_SIZE * 1.25);
            mob.vy = 0;
        }

        const mobGx = Math.floor((mob.x + 16) / BLOCK_SIZE);
        const mobGy = Math.floor((mob.y + 32) / BLOCK_SIZE);
        if (isSolidAtWorld(worldGrid, mobGx, mobGy)) {
            mob.y = (mobGy - 1) * BLOCK_SIZE;
            mob.vy = 0;
            delete mob.jumpStartY;
        }

        mob.x = Math.max(0, Math.min(mob.x, (WORLD_WIDTH - 1) * BLOCK_SIZE));

        if (mob.hp <= 0) {
            events.push({ type: 'mob_died', mobId: mob.id, x: mob.x, y: mob.y });
            continue; // don't include dead mob
        }
        updatedMobs.push(mob);
    }

    parentPort.postMessage({ type: 'physics', mobs: updatedMobs, droppedItems: remainingItems, events });
}, TICK_MS);
