require('dotenv').config();

const BLOCK_SIZE = 32;

const gameConfig = {
    WORLD_WIDTH: 100,
    WORLD_HEIGHT: 50,
    BLOCK_SIZE,
    CHUNK_SIZE: 32, // Tiles per chunk (32x32 tiles)
    MAX_HP: 20,
    LAVA_DAMAGE_INTERVAL: 500,
    HP_REGEN_INTERVAL: 5000,
    MAX_BUILD_RANGE: 4,
    MAX_PLAYER_SPEED: 900,
    MOVE_DISTANCE_TOLERANCE: 48,
    PLAYER_RESPAWN_DELAY: 3000,
    MOB_JUMP_FORCE: -5.5,
    MOB_MAX_JUMP_HEIGHT: BLOCK_SIZE * 1.25,
    MOB_MAX_COUNT: 2,
    MOB_SPAWN_INTERVAL: 25000,
    CYCLE_DURATION: 120,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
    PORT: process.env.PORT || 3000,
    DEBUG: process.env.DEBUG === '1'
};

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

const RECIPES = {
    'solid_wood_wall': { result: BLOCKS.SOLID_WOOD_WALL, amount: 1, ingredients: { [BLOCKS.WOOD]: 2 } },
    'solid_stone_wall': { result: BLOCKS.SOLID_STONE_WALL, amount: 1, ingredients: { [BLOCKS.STONE]: 2 } },
    'wooden_door':      { result: BLOCKS.DOOR,             amount: 1, ingredients: { [BLOCKS.WOOD]: 4 } },
    'wooden_sword':     { result: ITEMS.WOODEN_SWORD,      amount: 1, ingredients: { [BLOCKS.WOOD]: 3 } },
    'stone_sword':      { result: ITEMS.STONE_SWORD,       amount: 1, ingredients: { [BLOCKS.WOOD]: 2, [BLOCKS.STONE]: 2 } }
};

const OBJECTIVE_IDS = {
    COLLECT_WOOD: 'collect_wood',
    CRAFT_SWORD: 'craft_sword',
    BUILD_SHELTER: 'build_shelter',
    SURVIVE_NIGHT: 'survive_night'
};

const isBackground = (id) => [
    BLOCKS.AIR, BLOCKS.WALL, BLOCKS.DOOR
].includes(id);

const VALID_BLOCK_IDS = new Set(Object.values(BLOCKS).filter(id => id !== BLOCKS.AIR));
const VALID_ITEM_IDS = new Set([...VALID_BLOCK_IDS, ...Object.values(ITEMS)]);
const BACKGROUND_BLOCK_IDS = new Set([BLOCKS.WALL, BLOCKS.DOOR]);

module.exports = {
    ...gameConfig,
    BLOCKS,
    ITEMS,
    RECIPES,
    OBJECTIVE_IDS,
    isBackground,
    VALID_BLOCK_IDS,
    VALID_ITEM_IDS,
    BACKGROUND_BLOCK_IDS
};
