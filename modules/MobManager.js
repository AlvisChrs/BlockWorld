'use strict';

/**
 * MobManager - Handles knight mob spawning, AI state, item drops on death, and cleanup.
 */
class MobManager {
    constructor({ maxMobs = 2, spawnInterval = 25000, blockSize = 32, chunkSize = 32, worldWidth = 100 }) {
        this.mobs = [];
        this.nextMobId = 1;
        this.maxMobs = maxMobs;
        this.spawnInterval = spawnInterval;
        this.blockSize = blockSize;
        this.chunkSize = chunkSize;
        this.worldWidth = worldWidth;
    }

    getMobs() {
        return this.mobs;
    }

    setMobs(mobs) {
        if (Array.isArray(mobs)) {
            this.mobs = mobs;
        }
    }

    clearMobs() {
        this.mobs = [];
    }

    spawnNightMob(players, findSurfaceYFn) {
        if (this.mobs.length >= this.maxMobs) return null;

        const playerIds = Object.keys(players).filter(id => players[id].hp > 0 && !players[id].isAdmin);
        if (playerIds.length === 0) return null;

        const randomPlayer = players[playerIds[Math.floor(Math.random() * playerIds.length)]];
        const spawnDir = Math.random() < 0.5 ? -1 : 1;
        const spawnGx = Math.floor(randomPlayer.x / this.blockSize) + spawnDir * (8 + Math.floor(Math.random() * 4));

        if (spawnGx >= 2 && spawnGx < this.worldWidth - 2) {
            const spawnGy = typeof findSurfaceYFn === 'function' ? findSurfaceYFn(spawnGx) - 1 : 20;

            const newMob = {
                id: this.nextMobId++,
                x: spawnGx * this.blockSize,
                y: spawnGy * this.blockSize,
                vx: 0,
                vy: 0,
                hp: 15,
                maxHp: 15,
                attackCooldown: 0,
                facingRight: true
            };

            this.mobs.push(newMob);
            return newMob;
        }
        return null;
    }

    removeMob(mobId) {
        const index = this.mobs.findIndex(m => m.id === mobId);
        if (index !== -1) {
            return this.mobs.splice(index, 1)[0];
        }
        return null;
    }

    findMobIndex(mobId) {
        return this.mobs.findIndex(m => m.id === mobId);
    }
}

module.exports = MobManager;
