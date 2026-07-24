const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Game Constants
const WORLD_WIDTH = 80;
const WORLD_HEIGHT = 40;
const BLOCK_SIZE = 32;
const MAX_HP = 20;
const LAVA_DAMAGE_INTERVAL = 500; // ms
const HP_REGEN_INTERVAL = 5000; // ms
const MAX_BUILD_RANGE = 4; // Blocks

// Block Types
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
    WALL: 9,
    DOOR: 10,
    SPIKE: 11
};

// Background Blocks (Can walk through)
const isBackground = (id) => [BLOCKS.AIR, BLOCKS.LAVA, BLOCKS.WALL, BLOCKS.DOOR, BLOCKS.SPIKE].includes(id);

// Initialize World
let world = [];
for (let y = 0; y < WORLD_HEIGHT; y++) {
    let row = [];
    for (let x = 0; x < WORLD_WIDTH; x++) {
        if (y < 20) {
            row.push(BLOCKS.AIR);
        } else if (y === 20) {
            row.push(BLOCKS.GRASS);
        } else if (y < 32) {
            row.push(BLOCKS.DIRT);
        } else {
            row.push(BLOCKS.STONE);
        }
    }
    world.push(row);
}

// Add some demo features
for (let x = 10; x < 18; x++) world[20][x] = BLOCKS.LAVA;
for (let x = 22; x < 30; x++) world[20][x] = BLOCKS.ICE;

// Cabin
for (let y = 16; y <= 20; y++) {
    world[y][35] = BLOCKS.WOOD;
    world[y][42] = BLOCKS.WOOD;
}
for (let x = 35; x <= 42; x++) world[15][x] = BLOCKS.WOOD; // Roof
for (let x = 36; x <= 41; x++) {
    for (let y = 16; y <= 20; y++) world[y][x] = BLOCKS.WALL; // Wallpaper
}
world[20][36] = BLOCKS.DOOR;
world[19][36] = BLOCKS.DOOR; // Double height door
world[20][18] = BLOCKS.SPIKE;
world[20][19] = BLOCKS.SPIKE;

const players = {};

function getBlock(x, y) {
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return BLOCKS.AIR;
    return world[y][x];
}

function handleDeath(p, io, reason) {
    if (p.hp <= 0) return; // Already dead
    p.hp = 0;
    io.to(p.id).emit('hp_update', p.hp);
    
    // Emit death event so client can play animation
    io.emit('player_died', p.id);
    
    // Respawn after 3 seconds
    setTimeout(() => {
        if (players[p.id]) {
            players[p.id].hp = MAX_HP;
            players[p.id].x = 5 * BLOCK_SIZE;
            players[p.id].y = 16 * BLOCK_SIZE;
            io.to(p.id).emit('respawn', { x: players[p.id].x, y: players[p.id].y, hp: MAX_HP });
            io.emit('player_moved', players[p.id]);
        }
    }, 3000);
}

// HP / Damage ticker
setInterval(() => {
    for (let id in players) {
        const p = players[id];
        if (p.hp <= 0) continue; // Skip if dead

        const gridX = Math.floor(p.x / BLOCK_SIZE);
        const gridY = Math.floor((p.y + BLOCK_SIZE - 4) / BLOCK_SIZE); // feet
        const blockUnder = getBlock(gridX, gridY);
        const blockAt = getBlock(gridX, Math.floor((p.y + BLOCK_SIZE / 2) / BLOCK_SIZE)); // body

        // Spike Insta-kill
        if (blockUnder === BLOCKS.SPIKE || blockAt === BLOCKS.SPIKE) {
            handleDeath(p, io, 'spike');
            continue;
        }

        // Lava damage
        if (blockUnder === BLOCKS.LAVA || blockAt === BLOCKS.LAVA) {
            p.hp = Math.max(0, p.hp - 1);
            p.lastDamageTime = Date.now();
            io.to(id).emit('hp_update', p.hp);
            if (p.hp === 0) handleDeath(p, io, 'lava');
        }
    }
}, LAVA_DAMAGE_INTERVAL);

// HP Regen ticker
setInterval(() => {
    const now = Date.now();
    for (let id in players) {
        const p = players[id];
        if (p.hp > 0 && p.hp < MAX_HP) {
            // Only regen if haven't taken damage in last 3 seconds
            if (!p.lastDamageTime || now - p.lastDamageTime > 3000) {
                p.hp++;
                io.to(id).emit('hp_update', p.hp);
            }
        }
    }
}, HP_REGEN_INTERVAL);

io.on('connection', (socket) => {
    console.log(`[+] Player connected: ${socket.id}`);

    players[socket.id] = {
        id: socket.id,
        x: 5 * BLOCK_SIZE,
        y: 16 * BLOCK_SIZE,
        vx: 0,
        color: '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0'),
        isAdmin: false,
        canFly: false,
        noclip: false,
        hp: MAX_HP,
        lastDamageTime: 0
    };

    socket.emit('init', {
        id: socket.id,
        world: world,
        players: players,
        WORLD_WIDTH,
        WORLD_HEIGHT,
        BLOCK_SIZE,
        MAX_HP,
        MAX_BUILD_RANGE
    });

    socket.broadcast.emit('player_joined', players[socket.id]);

    socket.on('player_move', (data) => {
        if (players[socket.id] && players[socket.id].hp > 0) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].vx = data.vx || 0;
            socket.broadcast.emit('player_moved', players[socket.id]);
        }
    });

    function checkRange(p, gx, gy) {
        if (p.isAdmin) return true;
        const px = p.x / BLOCK_SIZE;
        const py = p.y / BLOCK_SIZE;
        const dist = Math.sqrt(Math.pow(px - gx, 2) + Math.pow(py - gy, 2));
        return dist <= MAX_BUILD_RANGE;
    }

    socket.on('break_block', (data) => {
        const { gridX, gridY } = data;
        const p = players[socket.id];
        if (!p || p.hp <= 0) return;

        if (gridX >= 0 && gridX < WORLD_WIDTH && gridY >= 0 && gridY < WORLD_HEIGHT) {
            if (!checkRange(p, gridX, gridY)) return; // Out of range

            world[gridY][gridX] = BLOCKS.AIR;
            io.emit('world_update', { gridX, gridY, blockId: BLOCKS.AIR });
        }
    });

    socket.on('place_block', (data) => {
        const { gridX, gridY, blockId } = data;
        const p = players[socket.id];
        if (!p || p.hp <= 0) return;

        if (gridX >= 0 && gridX < WORLD_WIDTH && gridY >= 0 && gridY < WORLD_HEIGHT) {
            if (!checkRange(p, gridX, gridY)) return; // Out of range

            if (world[gridY][gridX] === BLOCKS.AIR || isBackground(world[gridY][gridX])) {
                world[gridY][gridX] = blockId;
                io.emit('world_update', { gridX, gridY, blockId });
            }
        }
    });

    socket.on('chat_message', (msg) => {
        const player = players[socket.id];
        if (!player) return;

        if (msg.startsWith('/')) {
            const args = msg.split(' ');
            const command = args[0].toLowerCase();

            if (command === '/loginadmin' && args[1] === 'admin123') {
                player.isAdmin = true;
                socket.emit('server_message', '🛡️ You are now an ADMIN! Range limit removed.');
                return;
            }
            if (command === '/fly') {
                if (player.isAdmin) {
                    player.canFly = !player.canFly;
                    socket.emit('admin_status', { canFly: player.canFly, noclip: player.noclip });
                    socket.emit('server_message', `✈️ Fly mode: ${player.canFly ? 'ON' : 'OFF'}`);
                } else { socket.emit('server_message', '❌ Admin only.'); }
                return;
            }
            if (command === '/noclip') {
                if (player.isAdmin) {
                    player.noclip = !player.noclip;
                    socket.emit('admin_status', { canFly: player.canFly, noclip: player.noclip });
                    socket.emit('server_message', `👻 Noclip mode: ${player.noclip ? 'ON' : 'OFF'}`);
                } else { socket.emit('server_message', '❌ Admin only.'); }
                return;
            }
            if (command === '/clear') {
                if (player.isAdmin) {
                    let px = Math.floor(player.x / BLOCK_SIZE);
                    let py = Math.floor(player.y / BLOCK_SIZE);
                    for (let y = py - 3; y <= py + 3; y++) {
                        for (let x = px - 3; x <= px + 3; x++) {
                            if (x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT) {
                                world[y][x] = BLOCKS.AIR;
                                io.emit('world_update', { gridX: x, gridY: y, blockId: BLOCKS.AIR });
                            }
                        }
                    }
                    socket.emit('server_message', '💥 Area cleared!');
                } else { socket.emit('server_message', '❌ Admin only.'); }
                return;
            }
        }

        io.emit('chat_message', { id: socket.id, color: player.color, text: msg });
    });

    socket.on('disconnect', () => {
        console.log(`[-] Player disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('player_left', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`⚔️ LegionTopia Alpha Server running on http://localhost:${PORT}`);
});
