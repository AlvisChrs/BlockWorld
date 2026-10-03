const socket = io({ autoConnect: false });

// Canvas Setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const wrapper = document.querySelector('.canvas-wrapper');

function resizeCanvas() {
    canvas.width = wrapper.clientWidth;
    canvas.height = wrapper.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
canvas.focus();

// ─── Game State ────────────────────────────────────────────────────────────────
let chunkManager = new ClientChunkManager();
let players = {}, droppedItems = [], mobs = [], myId = null;
let WORLD_WIDTH = 0, WORLD_HEIGHT = 0, BLOCK_SIZE = 32, CHUNK_SIZE = 32, MAX_HP = 20, MAX_BUILD_RANGE = 4;
const camera = { x: 0, y: 0 };
let myHp = MAX_HP;
let canFly = false, noclip = false;
let isAdmin = false;
let myInventory = {};
let hoverTile = null;
const completedObjectives = new Set();

// Time & Day/Night Cycle State
let currentGameTime = 0;
let isNightTime = false;

// ─── Physics Constants ─────────────────────────────────────────────────────────
const GRAVITY = 0.55;
const JUMP_FORCE = -9;
const MAX_FALL_SPEED = 14;
const ACCEL = 0.55;
const MAX_SPEED = 3.25;
const FRICTION_NORMAL = 0.72;
const FRICTION_ICE    = 0.985;

// ─── Input ─────────────────────────────────────────────────────────────────────
const keys = { w:false,a:false,s:false,d:false,ArrowUp:false,ArrowLeft:false,ArrowDown:false,ArrowRight:false,' ':false };
const mobileKeys = { left:false, right:false, jump:false };

// Hotbar & Inventory State
let hotbar = [1, 2, 3, 4, 10]; // Starter hotbar includes Door (10)
let activeSlotIndex = 0;
let selectedBlockId = hotbar[0];
let isMouseDown = false;
let mouseButton = -1;
let lastBreakTime = 0;
let lastDoorWarpTime = 0;



// ─── Animation State ───────────────────────────────────────────────────────────
let playerVelocityX = 0, playerVelocityY = 0;
let isGrounded = false;
let onIce = false;
let standingOnDoor = false;
let actionAnim = ''; 
let actionAnimTimer = 0;

// ─── Celestial Bodies & Environment ───────────────────────────────────────────
const stars = [];
for (let i = 0; i < 400; i++) {
    stars.push({ 
        x: Math.random() * 4000, 
        y: Math.random() * 1000, 
        size: Math.random() * 1.5 + 0.3, 
        blink: Math.random() * Math.PI * 2,
        speed: 0.01 + Math.random() * 0.03
    });
}

const moon = { x: 3200, y: 120, r: 40 };
const sun  = { x: 800,  y: 100, r: 45 };

const clouds = [];
for (let i = 0; i < 20; i++) {
    clouds.push({ x: Math.random() * 4000, y: 30 + Math.random() * 300, speed: 0.06 + Math.random() * 0.15, size: 20 + Math.random() * 45 });
}

// ─── Particles ────────────────────────────────────────────────────────────────
let particles = [];
function spawnParticles(gx, gy, color) {
    for (let i = 0; i < 10; i++) {
        particles.push({
            x: gx * BLOCK_SIZE + Math.random() * BLOCK_SIZE,
            y: gy * BLOCK_SIZE + Math.random() * BLOCK_SIZE,
            vx: (Math.random() - 0.5) * 7,
            vy: (Math.random() * -5) - 1,
            life: 1.0,
            decay: 0.04 + Math.random() * 0.03,
            size: 3 + Math.random() * 4,
            color
        });
    }
}

function spawnPortalWarpParticles(pixelX, pixelY) {
    for (let i = 0; i < 24; i++) {
        particles.push({
            x: pixelX + Math.random() * BLOCK_SIZE,
            y: pixelY + Math.random() * BLOCK_SIZE,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            life: 1.0,
            decay: 0.03,
            size: 4 + Math.random() * 4,
            color: Math.random() < 0.5 ? '#c084fc' : '#38bdf8' // Purple & cyan portal spark
        });
    }
}

const BLOCK_PARTICLE_COLORS = {
    1:'#8B4513', 2:'#4a8c3f', 3:'#6b7280', 4:'#5c3a21',
    5:'#22863a', 6:'rgba(147,197,253,0.8)', 7:'#ff4500', 8:'#bae6fd',
    9:'#3f3f4e', 10:'#8a5a32', 11:'#a0a0a0', 12:'#5c3a21', 13:'#5a5a5a'
};



// Generate Icons for UI
const uiIcons = {};
function generateIcons() {
    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = 32; iconCanvas.height = 32;
    const ictx = iconCanvas.getContext('2d');
    const allIds = [1,2,3,4,5,6,7,8,9,10,11,12,13,101,102];
    for (let id of allIds) {
        ictx.clearRect(0, 0, 32, 32);
        drawBlock(ictx, id, 0, 0, 32, 0);
        uiIcons[id] = iconCanvas.toDataURL();
    }
}
generateIcons();


document.getElementById('audioToggleBtn').onclick = () => lofiAudio.toggle();

// ─── UI Setup: Hotbar & Inventory ─────────────────────────────────────────────
const joinOverlay = document.getElementById('joinOverlay');
const joinForm = document.getElementById('joinForm');
const usernameInput = document.getElementById('usernameInput');

joinForm.addEventListener('submit', e => {
    e.preventDefault();
    const username = usernameInput.value.trim() || 'Player';
    socket.auth = { username };
    socket.connect();
    joinOverlay.classList.add('hidden');
    canvas.focus();
});

function renderObjectives() {
    const list = document.getElementById('objectiveList');
    if (!list) return;
    list.innerHTML = '';
    for (const obj of OBJECTIVES) {
        const li = document.createElement('li');
        const done = obj.done();
        li.className = done ? 'done' : '';
        li.textContent = `${done ? '✓' : '□'} ${obj.text}`;
        list.appendChild(li);
    }
}

function renderHotbar() {
    const container = document.getElementById('hotbar');
    container.innerHTML = '';
    hotbar.forEach((blockId, index) => {
        const qty = myInventory[blockId] || 0;
        const div = document.createElement('div');
        div.className = `block-select ${index === activeSlotIndex ? 'active' : ''}`;
        div.innerHTML = `
            <div class="slot-num">${index + 1}</div>
            <span class="block-icon" style="background-image: url('${uiIcons[blockId] || ''}')"></span>
            ${qty > 0 ? `<div class="item-qty">${qty}</div>` : ''}
            ${BLOCK_NAMES[blockId] ? BLOCK_NAMES[blockId].split(' ')[0] : 'Item'}
        `;
        div.onclick = () => {
            activeSlotIndex = index;
            selectedBlockId = hotbar[activeSlotIndex];
            renderHotbar();
        };
        container.appendChild(div);
    });
}

function renderInventoryTab(tabName) {
    const content = document.getElementById('invContent');
    content.innerHTML = '';

    if (tabName === 'crafting') {
        RECIPES_LIST.forEach(rec => {
            const card = document.createElement('div');
            card.className = 'craft-card';
            card.innerHTML = `
                <div class="craft-info">
                    <span class="block-icon" style="background-image: url('${uiIcons[rec.resultId]}'); width: 36px; height: 36px;"></span>
                    <div class="craft-details">
                        <div class="craft-title">${rec.name}</div>
                        <div class="craft-req">Requires: ${rec.req}</div>
                    </div>
                </div>
                <button class="craft-btn" data-id="${rec.id}">Craft</button>
            `;
            card.querySelector('.craft-btn').onclick = () => {
                socket.emit('craft_item', rec.id);
            };
            content.appendChild(card);
        });
    } else {
        (INV_DATA[tabName] || []).forEach(blockId => {
            const qty = myInventory[blockId] || 0;
            const div = document.createElement('div');
            div.className = 'block-select';
            div.style.width = '64px';
            div.style.height = '64px';
            div.innerHTML = `
                <span class="block-icon" style="background-image: url('${uiIcons[blockId]}'); width: 32px; height: 32px;"></span>
                ${qty > 0 ? `<div class="item-qty">${qty}</div>` : ''}
                <div style="font-size: 0.5rem; margin-top: 4px;">${BLOCK_NAMES[blockId] || 'Item'}</div>
            `;
            div.onclick = () => {
                hotbar[activeSlotIndex] = blockId;
                selectedBlockId = blockId;
                renderHotbar();
                showAction(`Assigned ${BLOCK_NAMES[blockId]} to slot ${activeSlotIndex + 1}`, 1500);
            };
            content.appendChild(div);
        });
    }
}

const invOverlay = document.getElementById('inventoryOverlay');
document.getElementById('openInvBtn').onclick = () => invOverlay.classList.remove('hidden');
document.getElementById('closeInvBtn').onclick = () => invOverlay.classList.add('hidden');
window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'e' && document.activeElement !== document.getElementById('chatInput')) {
        invOverlay.classList.toggle('hidden');
    }
    if (e.key.toLowerCase() === 'g' && document.activeElement !== document.getElementById('chatInput')) {
        if (selectedBlockId) {
            socket.emit('drop_item', { itemType: selectedBlockId });
        }
    }
});

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderInventoryTab(btn.getAttribute('data-tab'));
    };
});

// ─── Character Renderer ────────────────────────────────────────────────────────
const SKIN = '#f5cba7', SHIRT = '#3b82f6', PANTS = '#1e3a5f', SHOE = '#2d1b00', HAIR = '#3b1f00', EYE = '#1a1a2e';

function drawCharacter(ctx, bs, vx, vy, onGround, actionAnim, actionTimer, isMine) {
    const t = Date.now();
    const walkCycle = (t / 220) % (Math.PI * 2);
    const isWalking = Math.abs(vx) > 0.4;

    let armSwing = isWalking ? Math.sin(walkCycle) * 0.5 : 0;
    let legSwing = isWalking ? Math.sin(walkCycle) * 0.45 : 0;

    if (actionAnim === 'break' && actionTimer > 0) armSwing = -1.1; 
    else if (actionAnim === 'place' && actionTimer > 0) armSwing = 0.9;

    let scaleY = 1;
    if (!onGround) scaleY = vy < 0 ? 1.18 : 0.88;

    const half = bs / 2;
    const hd = bs * 0.28, bw = bs * 0.22, bh = bs * 0.22;
    const lw = bs * 0.10, ll = bs * 0.24, foot = bs * 0.12;

    ctx.save();
    ctx.scale(1, scaleY);
    const bob = isWalking ? Math.abs(Math.sin(walkCycle)) * 1.5 : 0;
    const yBase = bs * 0.1 + bob;

    ctx.save(); ctx.translate(half, yBase + hd + bh * 0.3); ctx.rotate(-armSwing);
    ctx.fillStyle = SHIRT; ctx.fillRect(-lw * 0.5 - bw / 2 - 1, 0, lw, ll);
    ctx.fillStyle = SKIN; ctx.fillRect(-lw * 0.5 - bw / 2 - 1, ll - 1, lw, lw * 1.2); ctx.restore();

    ctx.save(); ctx.translate(half - bs * 0.06, yBase + hd + bh); ctx.rotate(-legSwing);
    ctx.fillStyle = PANTS; ctx.fillRect(-lw, 0, lw * 1.5, ll * 0.9);
    ctx.fillStyle = SHOE; ctx.fillRect(-lw * 0.2, ll * 0.85, foot * 1.2, foot * 0.7); ctx.restore();

    ctx.fillStyle = SHIRT; ctx.fillRect(half - bw, yBase + hd - 2, bw * 2, bh + 4);
    ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(half - bw + 2, yBase + hd + 4, bw * 2 - 4, 2);

    ctx.save(); ctx.translate(half + bs * 0.06, yBase + hd + bh); ctx.rotate(legSwing);
    ctx.fillStyle = PANTS; ctx.fillRect(-lw, 0, lw * 1.5, ll * 0.9);
    ctx.fillStyle = SHOE; ctx.fillRect(0, ll * 0.85, foot * 1.2, foot * 0.7); ctx.restore();

    ctx.fillStyle = SKIN; ctx.fillRect(half - hd / 2, yBase, hd, hd);
    ctx.fillStyle = HAIR; ctx.fillRect(half - hd / 2, yBase, hd, hd * 0.3);
    ctx.fillStyle = EYE; ctx.fillRect(half + hd * 0.15, yBase + hd * 0.35, hd * 0.12, hd * 0.14);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(half + hd * 0.15, yBase + hd * 0.65, hd * 0.2, hd * 0.06);

    ctx.save(); ctx.translate(half, yBase + hd + bh * 0.3); ctx.rotate(armSwing);
    ctx.fillStyle = SHIRT; ctx.fillRect(bw / 2 + 1, 0, lw, ll);
    ctx.fillStyle = SKIN; ctx.fillRect(bw / 2 + 1, ll - 1, lw, lw * 1.2);

    if (selectedBlockId === 101 || selectedBlockId === 102) {
        drawBlock(ctx, selectedBlockId, bw / 2 + 4, ll - 8, 16, 0);
    }
    ctx.restore();

    ctx.restore();

    if (isMine) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(half - bs * 0.3, bs * 0.08, bs * 0.6, bs * 0.85);
    }
}

function drawKnightMob(ctx, mob, camera) {
    const sx = mob.x - camera.x;
    const sy = mob.y - camera.y;
    const bs = BLOCK_SIZE;

    ctx.save();
    ctx.translate(sx + bs / 2, sy + bs / 2);
    if (!mob.facingRight) ctx.scale(-1, 1);
    ctx.translate(-bs / 2, -bs / 2);

    ctx.fillStyle = '#475569'; ctx.fillRect(6, 12, 20, 14);
    ctx.fillStyle = '#1e293b'; ctx.fillRect(8, 26, 16, 6);
    ctx.fillStyle = '#64748b'; ctx.fillRect(6, 2, 20, 10);
    ctx.fillStyle = '#ef4444'; ctx.fillRect(10, -3, 12, 5);
    ctx.fillStyle = '#dc2626'; ctx.fillRect(18, 5, 6, 3);
    ctx.fillStyle = '#94a3b8'; ctx.fillRect(2, 14, 6, 10);
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(24, 6, 4, 16);
    ctx.fillStyle = '#b45309'; ctx.fillRect(23, 20, 6, 3);

    ctx.restore();

    const hpRatio = Math.max(0, mob.hp / mob.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(sx, sy - 8, bs, 4);
    ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : '#ef4444';
    ctx.fillRect(sx, sy - 8, bs * hpRatio, 4);
}

function renderHpHud(hp) {
    const container = document.getElementById('hpHearts');
    container.innerHTML = '';
    for (let i = 0; i < MAX_HP; i++) {
        const span = document.createElement('span');
        span.className = 'heart' + (i < hp ? '' : ' empty');
        span.textContent = '❤️';
        container.appendChild(span);
    }
}

// ─── Socket Events ────────────────────────────────────────────────────────────
socket.on('init', (data) => {
    myId = data.id;
    players = data.players;
    droppedItems = data.droppedItems || [];
    mobs = data.mobs || [];
    WORLD_WIDTH = data.WORLD_WIDTH;
    WORLD_HEIGHT = data.WORLD_HEIGHT;
    BLOCK_SIZE = data.BLOCK_SIZE;
    CHUNK_SIZE = data.CHUNK_SIZE || 32;
    MAX_HP = data.MAX_HP;
    MAX_BUILD_RANGE = data.MAX_BUILD_RANGE;
    myHp = MAX_HP;
    myInventory = data.inventory || {};
    currentGameTime = data.gameTime || 0;
    isNightTime = data.isNight || false;
    
    // Load initial chunks
    if (data.chunks && Array.isArray(data.chunks)) {
        chunkManager.loadChunks(data.chunks);
    }
    
    resizeCanvas();
    renderHpHud(myHp);
    renderHotbar();
    renderInventoryTab('blocks');
    renderObjectives();
    requestAnimationFrame(gameLoop);
});

socket.on('player_joined', p => { players[p.id] = p; });
socket.on('player_left', id => { delete players[id]; });
socket.on('player_moved', p => { if (players[p.id]) Object.assign(players[p.id], p); });

socket.on('chunks_loaded', (data) => {
    if (data.chunks && Array.isArray(data.chunks)) {
        chunkManager.loadChunks(data.chunks);
    }
});

socket.on('time_sync', data => {
    currentGameTime = data.gameTime;
    isNightTime = data.isNight;
    
    const widget = document.getElementById('timeWidget');
    if (widget) {
        const remSecs = isNightTime ? (120 - currentGameTime) : (60 - currentGameTime);
        const mm = String(Math.floor(remSecs / 60)).padStart(2, '0');
        const ss = String(remSecs % 60).padStart(2, '0');
        if (isNightTime) {
            widget.textContent = `🌙 Night (${mm}:${ss})`;
            widget.style.color = '#a78bfa';
        } else {
            widget.textContent = `🌞 Day (${mm}:${ss})`;
            widget.style.color = '#fcd34d';
        }
    }
});

socket.on('inventory_update', inv => {
    myInventory = inv;
    renderHotbar();
    renderObjectives();
    const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab') || 'blocks';
    renderInventoryTab(activeTab);
});

socket.on('world_update', (data) => {
    const layer = data.layer || 'foreground';
    const old = chunkManager.getBlock(data.gridX, data.gridY, layer);
    chunkManager.setBlock(data.gridX, data.gridY, data.blockId, layer);
    if (data.blockId === 0 && old !== 0) {
        spawnParticles(data.gridX, data.gridY, BLOCK_PARTICLE_COLORS[old] || '#888');
    }
});

socket.on('action_failed', msg => showAction(msg, 1400));

socket.on('objective_event', data => {
    if (data && data.id) {
        completedObjectives.add(data.id);
        renderObjectives();
    }
});

socket.on('item_spawned', item => { droppedItems.push(item); });
socket.on('item_picked_up', data => {
    droppedItems = droppedItems.filter(i => i.id !== data.itemId);
});

socket.on('mobs_update', updatedMobs => { mobs = updatedMobs; });
socket.on('mob_spawned', mob => { mobs.push(mob); });
socket.on('mob_damaged', data => {
    const m = mobs.find(x => x.id === data.mobId);
    if (m) m.hp = data.hp;
});
socket.on('mob_died', data => {
    mobs = mobs.filter(m => m.id !== data.mobId);
    showAction('💥 Knight Defeated!', 1500);
});

socket.on('door_warped', data => {
    spawnPortalWarpParticles(data.x, data.y);
});

socket.on('hp_update', (hp) => { myHp = hp; renderHpHud(hp); });

socket.on('player_died', (data) => {
    const id = typeof data === 'string' ? data : data.id;
    if (players[id]) {
        players[id].isDead = true;
        players[id].deathTime = Date.now();
    }
});

socket.on('respawn', (d) => {
    if (players[myId]) {
        players[myId].x = d.x; players[myId].y = d.y;
        players[myId].isDead = false;
    }
    myHp = d.hp; playerVelocityX = 0; playerVelocityY = 0;
    renderHpHud(d.hp);
});

socket.on('admin_status', (s) => {
    canFly = !!s.canFly;
    noclip = !!s.noclip;
    isAdmin = !!s.isAdmin;
    document.getElementById('adminBadge').classList.toggle('hidden', !isAdmin);
});

// ─── Action Indicator ─────────────────────────────────────────────────────────
let actionHideTimer = null;
function showAction(msg, duration = 800) {
    const el = document.getElementById('actionIndicator');
    el.textContent = msg;
    el.classList.remove('hidden');
    if (actionHideTimer) clearTimeout(actionHideTimer);
    actionHideTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

// ─── Input Handling ───────────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
    if (keys.hasOwnProperty(e.key) && document.activeElement !== document.getElementById('chatInput')) {
        keys[e.key] = true;

        // Trigger Door Warp on 'W' or 'ArrowUp'
        if (e.key.toLowerCase() === 'w' || e.key === 'ArrowUp') {
            if (standingOnDoor) {
                const now = Date.now();
                if (now - lastDoorWarpTime > 500) {
                    lastDoorWarpTime = now;
                    socket.emit('enter_door');
                }
            }
        }

        if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    }
    if (/^[1-5]$/.test(e.key) && document.activeElement !== document.getElementById('chatInput')) {
        activeSlotIndex = parseInt(e.key) - 1;
        selectedBlockId = hotbar[activeSlotIndex];
        renderHotbar();
    }
});
window.addEventListener('keyup', e => { if (keys.hasOwnProperty(e.key)) keys[e.key] = false; });

canvas.addEventListener('mousedown', e => {
    canvas.focus();
    if (players[myId] && players[myId].isDead) return;
    isMouseDown = true; mouseButton = e.button;
    handleMouseAction(e);
});
canvas.addEventListener('mouseup', () => { isMouseDown = false; mouseButton = -1; });
canvas.addEventListener('mousemove', e => {
    updateHoverTile(e);
    if (isMouseDown) handleMouseAction(e);
});
canvas.addEventListener('mouseleave', () => { hoverTile = null; });

function getMouseWorldTile(e) {
    const rect = canvas.getBoundingClientRect();
    const worldX = (e.clientX - rect.left) * (canvas.width / rect.width) + camera.x;
    const worldY = (e.clientY - rect.top) * (canvas.height / rect.height) + camera.y;
    return {
        worldX,
        worldY,
        gridX: Math.floor(worldX / BLOCK_SIZE),
        gridY: Math.floor(worldY / BLOCK_SIZE)
    };
}

function updateHoverTile(e) {
    const tile = getMouseWorldTile(e);
    hoverTile = { gridX: tile.gridX, gridY: tile.gridY };
}

function handleMouseAction(e) {
    if (!players[myId]) return;
    const p = players[myId];
    if (p.isDead) return;

    const { worldX, worldY, gridX, gridY } = getMouseWorldTile(e);

    if (mouseButton === 0) {
        for (let mob of mobs) {
            if (Math.hypot(worldX - (mob.x + 16), worldY - (mob.y + 16)) < 36) {
                socket.emit('attack_mob', { mobId: mob.id, weaponId: selectedBlockId });
                actionAnim = 'break'; actionAnimTimer = 10;
                return;
            }
        }
    }

    const px = p.x / BLOCK_SIZE, py = p.y / BLOCK_SIZE;
    if (!isAdmin && Math.hypot(px - gridX, py - gridY) > MAX_BUILD_RANGE) {
        showAction('Too far away.', 900);
        return;
    }

    const now = Date.now();
    if (now - lastBreakTime < 120) return;
    lastBreakTime = now;

    if (mouseButton === 0) {
        socket.emit('break_block', { gridX, gridY });
        actionAnim = 'break'; actionAnimTimer = 10;
    } else if (mouseButton === 2) {
        if (selectedBlockId === 101 || selectedBlockId === 102) {
            showAction('Use swords to attack enemies.', 1000);
            return;
        }
        socket.emit('place_block', { gridX, gridY, blockId: selectedBlockId });
        actionAnim = 'place'; actionAnimTimer = 10;
    }
}
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ─── Physics ──────────────────────────────────────────────────────────────────
function getBlockAt(px, py) {
    const gx = Math.floor(px / BLOCK_SIZE), gy = Math.floor(py / BLOCK_SIZE);
    if (gx < 0 || gx >= WORLD_WIDTH || gy < 0 || gy >= WORLD_HEIGHT) return 1;
    return chunkManager.getBlock(gx, gy, 'foreground');
}

function getBackgroundBlockAt(px, py) {
    const gx = Math.floor(px / BLOCK_SIZE), gy = Math.floor(py / BLOCK_SIZE);
    if (gx < 0 || gx >= WORLD_WIDTH || gy < 0 || gy >= WORLD_HEIGHT) return 0;
    return chunkManager.getBlock(gx, gy, 'background');
}
function solid(id) {
    return [1, 2, 3, 4, 5, 8, 12, 13].includes(id);
}

function updatePhysics() {
    if (!myId || !players[myId]) return;
    const p = players[myId];
    if (p.isDead) return;

    const blockBelow = getBlockAt(p.x + BLOCK_SIZE * 0.4, p.y + BLOCK_SIZE + 1);
    onIce = blockBelow === 8;
    const friction = onIce ? FRICTION_ICE : FRICTION_NORMAL;

    // Check if player is standing on/in a Door block
    const pgx = Math.floor((p.x + BLOCK_SIZE / 2) / BLOCK_SIZE);
    const pgy = Math.floor((p.y + BLOCK_SIZE / 2) / BLOCK_SIZE);
    const blockStanding = getBackgroundBlockAt(p.x + BLOCK_SIZE / 2, p.y + BLOCK_SIZE / 2);
    const blockFoot = getBackgroundBlockAt(p.x + BLOCK_SIZE / 2, p.y + BLOCK_SIZE - 4);
    standingOnDoor = blockStanding === 10 || blockFoot === 10;

    const promptEl = document.getElementById('doorPrompt');
    if (promptEl) {
        if (standingOnDoor) promptEl.classList.remove('hidden');
        else promptEl.classList.add('hidden');
    }

    let movingX = false;
    if (keys.a || keys.ArrowLeft || mobileKeys.left) { playerVelocityX -= ACCEL; movingX = true; }
    if (keys.d || keys.ArrowRight || mobileKeys.right) { playerVelocityX += ACCEL; movingX = true; }
    if (!movingX) playerVelocityX *= friction;
    playerVelocityX = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, playerVelocityX));
    if (Math.abs(playerVelocityX) < 0.05) playerVelocityX = 0;

    if (canFly) {
        if (keys.w || keys.ArrowUp || keys[' '] || mobileKeys.jump) playerVelocityY = -MAX_SPEED;
        else if (keys.s || keys.ArrowDown) playerVelocityY = MAX_SPEED;
        else playerVelocityY = 0;
    } else {
        if ((keys.w || keys.ArrowUp || keys[' '] || mobileKeys.jump) && isGrounded) {
            playerVelocityY = JUMP_FORCE;
            isGrounded = false;
        }
        playerVelocityY = Math.min(playerVelocityY + GRAVITY, MAX_FALL_SPEED);
    }

    const PS = BLOCK_SIZE * 0.7, OX = (BLOCK_SIZE - PS) / 2;
    if (noclip) {
        p.x += playerVelocityX; p.y += playerVelocityY;
    } else {
        p.x += playerVelocityX;
        const lr = playerVelocityX > 0 ? p.x + OX + PS : p.x + OX;
        if (solid(getBlockAt(lr, p.y + OX + 2)) || solid(getBlockAt(lr, p.y + BLOCK_SIZE - 4))) {
            p.x = playerVelocityX > 0 ? Math.floor(lr / BLOCK_SIZE) * BLOCK_SIZE - PS - OX - 0.1 : Math.ceil(lr / BLOCK_SIZE) * BLOCK_SIZE - OX + 0.1;
            playerVelocityX = 0;
        }
        p.y += playerVelocityY;
        isGrounded = false;
        const tb = playerVelocityY > 0 ? p.y + BLOCK_SIZE : p.y + OX;
        if (solid(getBlockAt(p.x + OX + 2, tb)) || solid(getBlockAt(p.x + OX + PS - 4, tb))) {
            if (playerVelocityY > 0) {
                p.y = Math.floor(tb / BLOCK_SIZE) * BLOCK_SIZE - BLOCK_SIZE;
                isGrounded = true;
            } else {
                p.y = Math.ceil(tb / BLOCK_SIZE) * BLOCK_SIZE - OX;
            }
            playerVelocityY = 0;
        }
    }

    p.x = Math.max(0, Math.min(p.x, WORLD_WIDTH * BLOCK_SIZE - BLOCK_SIZE));
    p.y = Math.max(0, Math.min(p.y, WORLD_HEIGHT * BLOCK_SIZE - BLOCK_SIZE));
    if (p.y >= WORLD_HEIGHT * BLOCK_SIZE - BLOCK_SIZE) { isGrounded = true; playerVelocityY = 0; }

    p.vx = playerVelocityX;
    socket.emit('player_move', { x: p.x, y: p.y, vx: p.vx });

    if (actionAnimTimer > 0) actionAnimTimer--;
    else actionAnim = '';
}

function updateCamera() {
    if (!myId || !players[myId]) return;
    const p = players[myId];
    camera.x = Math.max(0, Math.min(p.x - canvas.width / 2 + BLOCK_SIZE / 2, WORLD_WIDTH * BLOCK_SIZE - canvas.width));
    camera.y = Math.max(0, Math.min(p.y - canvas.height / 2 + BLOCK_SIZE / 2, WORLD_HEIGHT * BLOCK_SIZE - canvas.height));
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
    const t = Date.now();
    updateCamera();

    const skyGrd = ctx.createLinearGradient(0, 0, 0, canvas.height);
    const sec = currentGameTime;

    if (sec < 50) {
        skyGrd.addColorStop(0, '#4a90e2');
        skyGrd.addColorStop(1, '#87CEEB');
    } else if (sec < 60) {
        const ratio = (sec - 50) / 10;
        skyGrd.addColorStop(0, '#311b92');
        skyGrd.addColorStop(1, ratio > 0.5 ? '#ff7e5f' : '#fd5e53');
    } else if (sec < 110) {
        skyGrd.addColorStop(0, '#020408');
        skyGrd.addColorStop(0.6, '#050d1a');
        skyGrd.addColorStop(1, '#0a1628');
    } else {
        const ratio = (sec - 110) / 10;
        skyGrd.addColorStop(0, '#ff7e5f');
        skyGrd.addColorStop(1, '#87CEEB');
    }
    ctx.fillStyle = skyGrd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (sec >= 50 && sec <= 115) {
        const starAlpha = sec < 60 ? (sec - 50) / 10 : (sec > 110 ? (115 - sec) / 5 : 1);
        for (const s of stars) {
            s.blink += s.speed;
            const alpha = starAlpha * (0.4 + 0.5 * Math.sin(s.blink));
            ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            ctx.fillRect(s.x - camera.x * 0.03, s.y - camera.y * 0.01, s.size, s.size);
        }
    }

    if (sec < 60) {
        const sunX = (canvas.width * (sec / 60)) - camera.x * 0.03;
        const sunY = 80 + Math.sin(sec / 60 * Math.PI) * -40 - camera.y * 0.01;
        ctx.fillStyle = '#fde047';
        ctx.beginPath(); ctx.arc(sunX, sunY, sun.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(253, 224, 71, 0.2)';
        ctx.beginPath(); ctx.arc(sunX, sunY, sun.r * 1.8, 0, Math.PI * 2); ctx.fill();
    } else {
        const nightSec = sec - 60;
        const moonX = (canvas.width * (nightSec / 60)) - camera.x * 0.03;
        const moonY = 80 + Math.sin(nightSec / 60 * Math.PI) * -40 - camera.y * 0.01;
        const moonGlow = ctx.createRadialGradient(moonX, moonY, moon.r * 0.3, moonX, moonY, moon.r * 2.5);
        moonGlow.addColorStop(0, 'rgba(240,240,200,0.12)'); moonGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = moonGlow; ctx.beginPath(); ctx.arc(moonX, moonY, moon.r * 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f0f0c8'; ctx.beginPath(); ctx.arc(moonX, moonY, moon.r, 0, Math.PI * 2); ctx.fill();
    }

    const cloudColor = sec >= 60 ? 'rgba(30,40,70,0.65)' : 'rgba(255,255,255,0.7)';
    for (const c of clouds) {
        c.x += c.speed;
        if (c.x - camera.x * 0.2 > canvas.width + 200) c.x = -c.size * 3;
        ctx.fillStyle = cloudColor;
        const cx = c.x - camera.x * 0.2, cy = c.y - camera.y * 0.05;
        ctx.beginPath();
        ctx.arc(cx, cy, c.size, 0, Math.PI * 2);
        ctx.arc(cx + c.size * 0.6, cy - c.size * 0.2, c.size * 0.7, 0, Math.PI * 2);
        ctx.fill();
    }

    const startX = Math.max(0, Math.floor(camera.x / BLOCK_SIZE));
    const endX   = Math.min(WORLD_WIDTH,  Math.ceil((camera.x + canvas.width)  / BLOCK_SIZE));
    const startY = Math.max(0, Math.floor(camera.y / BLOCK_SIZE));
    const endY   = Math.min(WORLD_HEIGHT, Math.ceil((camera.y + canvas.height) / BLOCK_SIZE));

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            const bg = chunkManager.getBlock(x, y, 'background');
            if (bg !== 0) {
                ctx.globalAlpha = 0.55;
                drawBlock(ctx, bg, x * BLOCK_SIZE - camera.x, y * BLOCK_SIZE - camera.y, BLOCK_SIZE, t);
                ctx.globalAlpha = 1;
            }
            const bid = chunkManager.getBlock(x, y, 'foreground');
            if (bid !== 0) drawBlock(ctx, bid, x * BLOCK_SIZE - camera.x, y * BLOCK_SIZE - camera.y, BLOCK_SIZE, t);
        }
    }

    if (hoverTile && hoverTile.gridX >= 0 && hoverTile.gridX < WORLD_WIDTH && hoverTile.gridY >= 0 && hoverTile.gridY < WORLD_HEIGHT) {
        const sx = hoverTile.gridX * BLOCK_SIZE - camera.x;
        const sy = hoverTile.gridY * BLOCK_SIZE - camera.y;
        const layer = getLayerForBlock(selectedBlockId);
        const occupied = chunkManager.getBlock(hoverTile.gridX, hoverTile.gridY, layer) !== 0;
        ctx.save();
        ctx.strokeStyle = occupied ? 'rgba(248,113,113,0.95)' : 'rgba(96,165,250,0.95)';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 1, sy + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
        ctx.restore();
    }

    for (const item of droppedItems) {
        const ix = item.x - camera.x;
        const iy = item.y - camera.y + Math.sin(t / 200 + item.id) * 3;
        drawBlock(ctx, item.itemType, ix, iy, 18, t);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(ix + 9, iy + 20, 7, 2, 0, 0, Math.PI*2); ctx.fill();
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.3; pt.life -= pt.decay;
        if (pt.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = pt.life; ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x - camera.x, pt.y - camera.y, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;

    for (const mob of mobs) {
        drawKnightMob(ctx, mob, camera);
    }

    for (const id in players) {
        const p = players[id];
        let sx = p.x - camera.x;
        let sy = p.y - camera.y;
        
        ctx.save();
        ctx.translate(sx + BLOCK_SIZE / 2, sy + BLOCK_SIZE / 2);

        if (p.isDead) {
            const dt = t - (p.deathTime || t);
            ctx.translate(0, -(dt / 15));
            ctx.rotate(dt / 100);
            ctx.globalAlpha = Math.max(0, 1 - (dt / 2500));
            ctx.fillStyle = '#a8a29e';
            ctx.beginPath(); ctx.arc(0, 0, BLOCK_SIZE/2, 0, Math.PI*2); ctx.fill();
        } else {
            const vx = p.vx || 0;
            if (vx > 0.3) p.facingRight = true;
            else if (vx < -0.3) p.facingRight = false;
            
            if (p.facingRight === false) {
                ctx.scale(-1, 1);
            }
            
            ctx.translate(-BLOCK_SIZE / 2, -BLOCK_SIZE / 2);
            drawCharacter(ctx, BLOCK_SIZE, vx, id === myId ? playerVelocityY : 0, id === myId ? isGrounded : true, actionAnim, actionAnimTimer, id === myId);
        }
        ctx.restore();

        if (!p.isDead) {
            ctx.fillStyle = id === myId ? '#bfdbfe' : '#e5e7eb';
            ctx.font = '600 11px Outfit';
            ctx.textAlign = 'center';
            ctx.fillText(p.username || 'Player', sx + BLOCK_SIZE / 2, sy - 6);
            ctx.textAlign = 'left';
        }
    }

    if (onIce) {
        ctx.fillStyle = 'rgba(135,206,250,0.2)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(135,206,250,0.9)'; ctx.font = 'bold 13px Outfit';
        ctx.fillText('❄️ Slippery Ice!', 10, canvas.height - 14);
    }
}

function gameLoop() { updatePhysics(); render(); requestAnimationFrame(gameLoop); }

// ─── Chat ─────────────────────────────────────────────────────────────────────
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');

chatForm.addEventListener('submit', e => {
    e.preventDefault();
    const val = chatInput.value.trim();
    if (val) { socket.emit('chat_message', val); chatInput.value = ''; }
});

socket.on('chat_message', msg => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.style.color = msg.color;
    name.style.fontWeight = 'bold';
    name.textContent = `${msg.username || 'Player'}:`;
    li.append(name, ` ${msg.text}`);
    chatMessages.appendChild(li);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});
socket.on('server_message', msg => {
    const li = document.createElement('li');
    li.className = 'msg-server'; li.textContent = msg;
    chatMessages.appendChild(li); chatMessages.scrollTop = chatMessages.scrollHeight;
});

// ─── Mobile Controls ──────────────────────────────────────────────────────────
['left','right','jump'].forEach(key => {
    const btn = document.getElementById(`btn-${key === 'jump' ? 'jump' : key}`);
    if (!btn) return;
    btn.addEventListener('touchstart', e => { e.preventDefault(); mobileKeys[key] = true; });
    btn.addEventListener('touchend',   e => { e.preventDefault(); mobileKeys[key] = false; });
    btn.addEventListener('mousedown',  ()=> { mobileKeys[key] = true; });
    btn.addEventListener('mouseup',    ()=> { mobileKeys[key] = false; });
    btn.addEventListener('mouseleave', ()=> { mobileKeys[key] = false; });
});
