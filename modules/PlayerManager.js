'use strict';

/**
 * PlayerManager - Manages player lifecycle, states, inventories, and chunk visibility.
 */
class PlayerManager {
    constructor({ maxHp = 20, blockSize = 32, chunkSize = 32, chunkManager = null }) {
        this.players = {};
        this.maxHp = maxHp;
        this.blockSize = blockSize;
        this.chunkSize = chunkSize;
        this.chunkManager = chunkManager;
    }

    setChunkManager(chunkManager) {
        this.chunkManager = chunkManager;
    }

    sanitizeUsername(name) {
        if (typeof name !== 'string') return 'Player';
        const clean = name.trim().replace(/[^\w \-]/g, '').slice(0, 18);
        return clean || 'Player';
    }

    createDefaultInventory(BLOCKS) {
        return {
            [BLOCKS.DIRT]: 20,
            [BLOCKS.GRASS]: 10,
            [BLOCKS.STONE]: 15,
            [BLOCKS.WOOD]: 10,
            [BLOCKS.LEAVES]: 10,
            [BLOCKS.GLASS]: 5,
            [BLOCKS.LAVA]: 5,
            [BLOCKS.ICE]: 5,
            [BLOCKS.SPIKE]: 8,
            [BLOCKS.DOOR]: 4
        };
    }

    addPlayer(socketId, authUsername, BLOCKS, OBJECTIVE_IDS) {
        const username = this.sanitizeUsername(authUsername);
        const starterInventory = this.createDefaultInventory(BLOCKS);

        const player = {
            id: socketId,
            username,
            x: 10 * this.blockSize,
            y: 15 * this.blockSize,
            vx: 0,
            color: '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0'),
            isAdmin: false,
            canFly: false,
            noclip: false,
            hp: this.maxHp,
            lastDamageTime: 0,
            lastMoveAt: Date.now(),
            inventory: starterInventory,
            objectives: {
                [OBJECTIVE_IDS.BUILD_SHELTER]: false,
                [OBJECTIVE_IDS.SURVIVE_NIGHT]: false
            },
            visibleChunks: new Set()
        };

        this.players[socketId] = player;
        return player;
    }

    getPlayer(socketId) {
        return this.players[socketId] || null;
    }

    removePlayer(socketId) {
        const player = this.players[socketId];
        if (player) {
            delete this.players[socketId];
        }
        return player;
    }

    getAllPlayers() {
        return this.players;
    }

    updatePlayerChunkVisibility(socket, player) {
        if (!this.chunkManager || !player) return { newChunks: [] };

        const playerGridX = Math.floor(player.x / this.blockSize);
        const playerGridY = Math.floor(player.y / this.blockSize);
        const visibleChunks = this.chunkManager.getVisibleChunks(playerGridX, playerGridY, 1024, 768);
        const newChunkKeys = new Set();
        const newChunks = [];

        for (const chunk of visibleChunks) {
            const key = `${chunk.chunkX},${chunk.chunkY}`;
            newChunkKeys.add(key);

            if (!player.visibleChunks.has(key)) {
                newChunks.push(this.chunkManager.serializeChunk(chunk.chunkX, chunk.chunkY, 'foreground'));
                newChunks.push(this.chunkManager.serializeChunk(chunk.chunkX, chunk.chunkY, 'background'));
            }
        }

        const toJoin = [...newChunkKeys].filter(k => !player.visibleChunks.has(k));
        const toLeave = [...player.visibleChunks].filter(k => !newChunkKeys.has(k));

        for (const k of toJoin) socket.join(`chunk:${k}`);
        for (const k of toLeave) socket.leave(`chunk:${k}`);

        player.visibleChunks = newChunkKeys;
        return { newChunks };
    }
}

module.exports = PlayerManager;
