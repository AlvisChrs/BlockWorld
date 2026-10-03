// Inventory Categories
const INV_DATA = {
    'blocks': [1, 2, 3, 4, 5, 6, 8, 12, 13],
    'bg': [9, 10],
    'deadly': [7, 11],
    'weapons': [101, 102]
};

const BLOCK_NAMES = {
    1:'Dirt', 2:'Grass', 3:'Stone', 4:'Wood Log', 5:'Leaves', 6:'Glass', 
    7:'Lava', 8:'Ice', 9:'Wood Wall (BG)', 10:'Wooden Door', 11:'Spike',
    12:'Solid Wood Wall', 13:'Solid Stone Wall', 101:'Wooden Sword (3 DMG)', 102:'Stone Sword (5 DMG)'
};

const RECIPES_LIST = [
    { id: 'solid_wood_wall', name: 'Solid Wood Wall (1x)', req: '2x Wood', resultId: 12 },
    { id: 'solid_stone_wall', name: 'Solid Stone Wall (1x)', req: '2x Stone', resultId: 13 },
    { id: 'wooden_door', name: 'Wooden Door (1x)', req: '4x Wood', resultId: 10 },
    { id: 'wooden_sword', name: 'Wooden Sword (3 DMG)', req: '3x Wood', resultId: 101 },
    { id: 'stone_sword', name: 'Stone Sword (5 DMG)', req: '2x Wood + 2x Stone', resultId: 102 }
];

const BACKGROUND_BLOCKS = new Set([9, 10]);
const OBJECTIVES = [
    { id: 'collect_wood', text: 'Collect 3 Wood', done: () => (myInventory[4] || 0) >= 3 },
    { id: 'craft_sword', text: 'Craft a Sword', done: () => completedObjectives.has('craft_sword') || (myInventory[101] || 0) > 0 || (myInventory[102] || 0) > 0 },
    { id: 'build_shelter', text: 'Place a shelter block', done: () => completedObjectives.has('build_shelter') },
    { id: 'survive_night', text: 'Survive one night', done: () => completedObjectives.has('survive_night') }
];

function getLayerForBlock(blockId) {
    return BACKGROUND_BLOCKS.has(blockId) ? 'background' : 'foreground';
}