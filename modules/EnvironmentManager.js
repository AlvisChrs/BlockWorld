'use strict';

/**
 * EnvironmentManager - Manages Day/Night cycle, Lava/Spike environmental hazards, and HP regeneration.
 */
class EnvironmentManager {
    constructor({ cycleDuration = 120, lavaInterval = 500, regenInterval = 5000, maxHp = 20 }) {
        this.cycleDuration = cycleDuration;
        this.lavaInterval = lavaInterval;
        this.regenInterval = regenInterval;
        this.maxHp = maxHp;
        this.gameTime = 0;
    }

    tickCycle() {
        this.gameTime = (this.gameTime + 1) % this.cycleDuration;
        const isNight = this.gameTime >= 60;
        return { gameTime: this.gameTime, isNight };
    }

    checkEnvironmentHazards(players, getBlockFn, handleDeathFn, io, BLOCKS, blockSize = 32) {
        for (const id in players) {
            const p = players[id];
            if (!p || p.hp <= 0) continue;

            const gridX = Math.floor((p.x + blockSize * 0.4) / blockSize);
            const gridY = Math.floor((p.y + blockSize - 4) / blockSize);
            const blockUnder = getBlockFn(gridX, gridY);
            const blockAt = getBlockFn(gridX, Math.floor((p.y + blockSize / 2) / blockSize));

            if (blockUnder === BLOCKS.SPIKE || blockAt === BLOCKS.SPIKE) {
                if (typeof handleDeathFn === 'function') {
                    handleDeathFn(p, io, 'spike');
                }
                continue;
            }

            if (blockUnder === BLOCKS.LAVA || blockAt === BLOCKS.LAVA) {
                p.hp = Math.max(0, p.hp - 1);
                p.lastDamageTime = Date.now();
                if (io) io.to(id).emit('hp_update', p.hp);
                if (p.hp === 0 && typeof handleDeathFn === 'function') {
                    handleDeathFn(p, io, 'lava');
                }
            }
        }
    }

    regenerateHealth(players, io) {
        const now = Date.now();
        for (const id in players) {
            const p = players[id];
            if (p && p.hp > 0 && p.hp < this.maxHp) {
                if (!p.lastDamageTime || now - p.lastDamageTime > 3000) {
                    p.hp++;
                    if (io) io.to(id).emit('hp_update', p.hp);
                }
            }
        }
    }
}

module.exports = EnvironmentManager;
