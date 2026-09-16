const PlayerManager = require('../modules/PlayerManager');
const MobManager = require('../modules/MobManager');
const EnvironmentManager = require('../modules/EnvironmentManager');
const CombatSystem = require('../modules/CombatSystem');
const Validator = require('../utils/Validator');

describe('Backend Modules & Security Tests (Points 2 to 5)', () => {

    describe('Validator - Solid Collision & Security', () => {
        test('isSolidBlock identifies solid vs non-solid blocks correctly', () => {
            expect(Validator.isSolidBlock(0)).toBe(false); // AIR
            expect(Validator.isSolidBlock(9)).toBe(false); // WALL
            expect(Validator.isSolidBlock(10)).toBe(false); // DOOR
            expect(Validator.isSolidBlock(1)).toBe(true);  // DIRT
            expect(Validator.isSolidBlock(3)).toBe(true);  // STONE
            expect(Validator.isSolidBlock(12)).toBe(true); // SOLID_WOOD_WALL
        });

        test('isCollidingWithSolid detects solid block collisions accurately', () => {
            const mockGetBlock = (gx, gy) => (gx === 5 && gy === 5 ? 1 : 0); // Solid block at (5,5)

            // Test collision at tile 5,5 (pixel coords 5*32=160, 5*32=160)
            expect(Validator.isCollidingWithSolid(160, 160, 32, 32, mockGetBlock)).toBe(true);
            // Test non-colliding at tile 0,0 (pixel coords 0, 0)
            expect(Validator.isCollidingWithSolid(0, 0, 32, 32, mockGetBlock)).toBe(false);
        });
    });

    describe('PlayerManager', () => {
        let playerManager;
        const BLOCKS = { DIRT: 1, GRASS: 2, STONE: 3, WOOD: 4, LEAVES: 5, GLASS: 6, LAVA: 7, ICE: 8, SPIKE: 11, DOOR: 10 };
        const OBJECTIVES = { BUILD_SHELTER: 'build_shelter', SURVIVE_NIGHT: 'survive_night' };

        beforeEach(() => {
            playerManager = new PlayerManager({ maxHp: 20, blockSize: 32, chunkSize: 32 });
        });

        test('addPlayer creates and returns a structured player object', () => {
            const player = playerManager.addPlayer('socket-1', '  TestUser_123  ', BLOCKS, OBJECTIVES);
            expect(player.id).toBe('socket-1');
            expect(player.username).toBe('TestUser_123');
            expect(player.hp).toBe(20);
            expect(player.inventory[BLOCKS.DIRT]).toBe(20);
            expect(playerManager.getPlayer('socket-1')).toBe(player);
        });

        test('removePlayer deletes player correctly', () => {
            playerManager.addPlayer('socket-1', 'Player1', BLOCKS, OBJECTIVES);
            const removed = playerManager.removePlayer('socket-1');
            expect(removed.id).toBe('socket-1');
            expect(playerManager.getPlayer('socket-1')).toBeNull();
        });
    });

    describe('MobManager', () => {
        let mobManager;

        beforeEach(() => {
            mobManager = new MobManager({ maxMobs: 2, spawnInterval: 25000, worldWidth: 100 });
        });

        test('spawnNightMob creates night knight mob near active players', () => {
            const players = {
                'p1': { id: 'p1', x: 1600, y: 300, hp: 20, isAdmin: false }
            };
            const mockFindSurfaceY = () => 15;

            const newMob = mobManager.spawnNightMob(players, mockFindSurfaceY);
            expect(newMob).not.toBeNull();
            expect(newMob.hp).toBe(15);
            expect(mobManager.getMobs().length).toBe(1);
        });

        test('clearMobs empties mob array', () => {
            mobManager.setMobs([{ id: 1 }, { id: 2 }]);
            expect(mobManager.getMobs().length).toBe(2);
            mobManager.clearMobs();
            expect(mobManager.getMobs().length).toBe(0);
        });
    });

    describe('EnvironmentManager', () => {
        let envManager;

        beforeEach(() => {
            envManager = new EnvironmentManager({ cycleDuration: 120, lavaInterval: 500, regenInterval: 5000, maxHp: 20 });
        });

        test('tickCycle correctly increments gameTime and detects night time', () => {
            let res = envManager.tickCycle();
            expect(res.gameTime).toBe(1);
            expect(res.isNight).toBe(false);

            envManager.gameTime = 59;
            res = envManager.tickCycle();
            expect(res.gameTime).toBe(60);
            expect(res.isNight).toBe(true);
        });

        test('checkEnvironmentHazards applies damage for lava and spike hazards', () => {
            const players = {
                'p1': { id: 'p1', x: 100, y: 100, hp: 10 }
            };
            const mockGetBlock = () => 7; // LAVA = 7
            let deathCalled = false;
            const mockHandleDeath = () => { deathCalled = true; };

            envManager.checkEnvironmentHazards(players, mockGetBlock, mockHandleDeath, null, { LAVA: 7, SPIKE: 11 });
            expect(players.p1.hp).toBe(9);
            expect(deathCalled).toBe(false);
        });
    });

    describe('CombatSystem', () => {
        let combatSystem;

        beforeEach(() => {
            combatSystem = new CombatSystem({ maxHp: 20, respawnDelay: 3000 });
        });

        test('calculateWeaponDamage computes correct damage per item', () => {
            const ITEMS = { WOODEN_SWORD: 101, STONE_SWORD: 102 };
            expect(combatSystem.calculateWeaponDamage(101, { 101: 1 }, ITEMS)).toBe(3);
            expect(combatSystem.calculateWeaponDamage(102, { 102: 1 }, ITEMS)).toBe(5);
            expect(combatSystem.calculateWeaponDamage(0, {}, ITEMS)).toBe(1);
        });
    });
});
