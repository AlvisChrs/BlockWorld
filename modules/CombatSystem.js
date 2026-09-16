'use strict';

/**
 * CombatSystem - Handles player vs mob attacks, damage calculations, and death sequence logic.
 */
class CombatSystem {
    constructor({ maxHp = 20, respawnDelay = 3000, blockSize = 32, chunkSize = 32 }) {
        this.maxHp = maxHp;
        this.respawnDelay = respawnDelay;
        this.blockSize = blockSize;
        this.chunkSize = chunkSize;
    }

    calculateWeaponDamage(weaponId, playerInventory, ITEMS) {
        if (weaponId === ITEMS.WOODEN_SWORD && playerInventory[ITEMS.WOODEN_SWORD] > 0) return 3;
        if (weaponId === ITEMS.STONE_SWORD && playerInventory[ITEMS.STONE_SWORD] > 0) return 5;
        return 1;
    }

    handlePlayerDeath(p, io, players, reason, emitToChunkNeighborsFn, sendToNearbyPlayersFn) {
        if (!p || p.isDead) return;

        p.hp = 0;
        p.isDead = true;
        p.deathSequence = (p.deathSequence || 0) + 1;
        io.to(p.id).emit('hp_update', p.hp);

        const pcx = Math.floor((Math.floor(p.x / this.blockSize)) / this.chunkSize);
        const pcy = Math.floor((Math.floor(p.y / this.blockSize)) / this.chunkSize);
        if (typeof emitToChunkNeighborsFn === 'function') {
            emitToChunkNeighborsFn('player_died', { id: p.id, reason }, pcx, pcy, 1);
        }

        setTimeout(() => {
            const player = players[p.id];
            if (player && player.isDead && player.deathSequence === p.deathSequence) {
                player.hp = this.maxHp;
                player.x = 10 * this.blockSize;
                player.y = 15 * this.blockSize;
                player.vx = 0;
                player.isDead = false;
                player.lastDamageTime = 0;
                player.lastMoveAt = Date.now();
                io.to(p.id).emit('respawn', { x: player.x, y: player.y, hp: this.maxHp });
                if (typeof sendToNearbyPlayersFn === 'function') {
                    sendToNearbyPlayersFn('player_moved', player, player.x, player.y);
                }
            }
        }, this.respawnDelay);
    }
}

module.exports = CombatSystem;
