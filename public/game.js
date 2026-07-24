const socket = io();

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
let world = [], players = {}, myId = null;
let WORLD_WIDTH = 0, WORLD_HEIGHT = 0, BLOCK_SIZE = 32, MAX_HP = 20, MAX_BUILD_RANGE = 4;
const camera = { x: 0, y: 0 };
let myHp = MAX_HP;
let canFly = false, noclip = false;
let isAdmin = false;

// ─── Physics Constants ─────────────────────────────────────────────────────────
const GRAVITY = 0.55;
const JUMP_FORCE = -9;
const MAX_FALL_SPEED = 14;
const ACCEL = 1.0;
const MAX_SPEED = 5.5;
const FRICTION_NORMAL = 0.72;
const FRICTION_ICE    = 0.985;

// ─── Input ─────────────────────────────────────────────────────────────────────
const keys = { w:false,a:false,s:false,d:false,ArrowUp:false,ArrowLeft:false,ArrowDown:false,ArrowRight:false,' ':false };
const mobileKeys = { left:false, right:false, jump:false };

// Hotbar & Inventory State
let hotbar = [1, 2, 3, 4, 10]; // Default blocks in slots 1-5
let activeSlotIndex = 0; // 0 to 4
let selectedBlockId = hotbar[0];
let isMouseDown = false;
let mouseButton = -1;
let lastBreakTime = 0;

// Inventory Categories
const INV_DATA = {
    'blocks': [1, 2, 3, 4, 5, 6, 8],
    'bg': [9, 10],
    'deadly': [7, 11]
};
const BLOCK_NAMES = {
    1:'Dirt', 2:'Grass', 3:'Stone', 4:'Wood Log', 5:'Leaves', 6:'Glass', 
    7:'Lava', 8:'Ice', 9:'Wall', 10:'Door', 11:'Spike'
};

// ─── Animation State ───────────────────────────────────────────────────────────
let playerVelocityX = 0, playerVelocityY = 0;
let isGrounded = false;
let onIce = false;
let actionAnim = ''; 
let actionAnimTimer = 0;

// ─── Stars (More dense and beautiful) ─────────────────────────────────────────
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

// ─── Moon ─────────────────────────────────────────────────────────────────────
const moon = { x: 3200, y: 120, r: 40 };

// ─── Clouds ───────────────────────────────────────────────────────────────────
const clouds = [];
for (let i = 0; i < 18; i++) {
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
const BLOCK_PARTICLE_COLORS = {
    1:'#8B4513', 2:'#4a8c3f', 3:'#6b7280', 4:'#5c3a21',
    5:'#22863a', 6:'rgba(147,197,253,0.8)', 7:'#ff4500', 8:'#bae6fd',
    9:'#3f3f4e', 10:'#8a5a32', 11:'#a0a0a0'
};

// ─── Procedural Block Renderer ────────────────────────────────────────────────
function drawBlock(ctx, blockId, sx, sy, bs, time) {
    if (!blockId) return;
    const t = time || 0;
    ctx.save();
    ctx.translate(sx, sy);

    switch(blockId) {
        case 1: // Dirt
            ctx.fillStyle = '#6b3a2a';
            ctx.fillRect(0, 0, bs, bs);
            ctx.fillStyle = '#4e2a18';
            ctx.fillRect(4, 6, 5, 4); ctx.fillRect(16, 14, 4, 3);
            ctx.fillRect(7, 22, 6, 3); ctx.fillRect(22, 5, 4, 4);
            ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.strokeRect(0, 0, bs, bs);
            break;
        case 2: // Grass
            ctx.fillStyle = '#6b3a2a'; ctx.fillRect(0, 8, bs, bs - 8);
            ctx.fillStyle = '#4e2a18'; ctx.fillRect(4, 14, 4, 3); ctx.fillRect(18, 20, 5, 3);
            ctx.fillStyle = '#3a7d35'; ctx.fillRect(0, 0, bs, 10);
            ctx.fillStyle = '#4a9e41'; for(let gx=1; gx<bs; gx+=5) ctx.fillRect(gx, 0, 2, 6);
            ctx.fillStyle = '#5cbf52'; for(let gx=3; gx<bs; gx+=7) ctx.fillRect(gx, 0, 1, 4);
            ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.strokeRect(0, 0, bs, bs);
            break;
        case 3: // Stone
            ctx.fillStyle = '#5a5a5a'; ctx.fillRect(0, 0, bs, bs);
            const cracks = [[1,1,14,14],[16,2,13,13],[1,16,10,13],[12,16,18,13]];
            ctx.fillStyle = '#4a4a4a'; for(const [cx,cy,cw,ch] of cracks) ctx.fillRect(cx,cy,cw,ch);
            ctx.fillStyle = '#666'; for(const [cx,cy,cw,ch] of cracks) ctx.fillRect(cx+1,cy+1,cw-2,ch-2);
            ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.strokeRect(0, 0, bs, bs);
            break;
        case 4: // Wood Log (New)
            ctx.fillStyle = '#5c3a21'; ctx.fillRect(0, 0, bs, bs);
            ctx.fillStyle = '#3d2413'; 
            ctx.fillRect(0, 2, bs, 3); ctx.fillRect(0, 10, bs, 2);
            ctx.fillRect(0, 18, bs, 3); ctx.fillRect(0, 26, bs, 2);
            ctx.fillStyle = '#7a4d2e'; 
            ctx.fillRect(0, 5, bs, 2); ctx.fillRect(0, 21, bs, 2);
            ctx.strokeStyle = '#2b180b'; ctx.strokeRect(0, 0, bs, bs);
            break;
        case 5: // Leaves
            ctx.fillStyle = '#1a5e20'; ctx.fillRect(0, 0, bs, bs);
            const leafPos = [[4,3],[12,2],[20,5],[2,14],[10,12],[18,14],[6,22],[16,21],[24,10]];
            for (const [lx, ly] of leafPos) {
                ctx.fillStyle = `hsl(${120 + Math.sin(lx*ly)*15}, 55%, ${30 + (lx%4)*4}%)`;
                ctx.beginPath(); ctx.ellipse(lx, ly, 5, 4, lx/10, 0, Math.PI*2); ctx.fill();
            }
            ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.strokeRect(0, 0, bs, bs);
            break;
        case 6: // Glass
            ctx.fillStyle = 'rgba(147,197,253,0.18)'; ctx.fillRect(0, 0, bs, bs);
            ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(3, 3, 4, 12); ctx.fillRect(3, 3, 12, 4);
            ctx.strokeStyle = 'rgba(147,197,253,0.7)'; ctx.strokeRect(0, 0, bs, bs);
            break;
        case 7: // Lava
            const lavaPhase = (t / 400) % (Math.PI * 2);
            const lavaGrd = ctx.createLinearGradient(0, 0, 0, bs);
            lavaGrd.addColorStop(0, `hsl(${20 + Math.sin(lavaPhase)*10}, 100%, 55%)`);
            lavaGrd.addColorStop(0.5, '#c0392b');
            lavaGrd.addColorStop(1, '#7b1818');
            ctx.fillStyle = lavaGrd; ctx.fillRect(0, 0, bs, bs);
            ctx.fillStyle = `rgba(255, 160, 20, ${0.5 + 0.4 * Math.sin(lavaPhase * 2)})`;
            ctx.beginPath(); ctx.arc(8, 20 + 4*Math.sin(lavaPhase), 4, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(22, 14 + 4*Math.sin(lavaPhase + 1), 3, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = 'rgba(200,60,0,0.5)'; ctx.strokeRect(0, 0, bs, bs);
            break;
        case 8: // Ice
            const iceGrd = ctx.createLinearGradient(0, 0, bs, bs);
            iceGrd.addColorStop(0, '#e0f7ff'); iceGrd.addColorStop(1, '#7dd3fc');
            ctx.fillStyle = iceGrd; ctx.fillRect(0, 0, bs, bs);
            ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(bs/2, 2); ctx.lineTo(bs/2, bs-2); ctx.moveTo(2, bs/2); ctx.lineTo(bs-2, bs/2);
            ctx.moveTo(5, 5); ctx.lineTo(bs-5, bs-5); ctx.moveTo(bs-5, 5); ctx.lineTo(5, bs-5); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(2, 2, 10, 6);
            ctx.strokeStyle = 'rgba(135,206,250,0.8)'; ctx.strokeRect(0, 0, bs, bs);
            break;
        case 9: // Wall (Background Brick)
            ctx.fillStyle = '#3f3f4e'; ctx.fillRect(0, 0, bs, bs);
            ctx.fillStyle = '#2f2f3a';
            ctx.fillRect(0, 7, bs, 2); ctx.fillRect(0, 15, bs, 2); ctx.fillRect(0, 23, bs, 2);
            ctx.fillRect(15, 0, 2, 7); ctx.fillRect(7, 7, 2, 8); ctx.fillRect(23, 7, 2, 8);
            ctx.fillRect(15, 15, 2, 8); ctx.fillRect(7, 23, 2, 9);
            // Shade to look like background
            ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, 0, bs, bs);
            break;
        case 10: // Door (Background Wood)
            ctx.fillStyle = '#8a5a32'; ctx.fillRect(0, 0, bs, bs);
            ctx.strokeStyle = '#52341b'; ctx.lineWidth = 2;
            ctx.strokeRect(2, 2, bs-4, bs-4);
            ctx.strokeRect(6, 6, bs-12, bs/2 - 8);
            ctx.strokeRect(6, bs/2 + 2, bs-12, bs/2 - 8);
            ctx.fillStyle = '#eab308'; // doorknob
            ctx.beginPath(); ctx.arc(bs - 6, bs/2, 2.5, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(0, 0, bs, bs);
            break;
        case 11: // Spike
            ctx.fillStyle = '#transparent'; ctx.fillRect(0, 0, bs, bs);
            ctx.fillStyle = '#888'; // base
            ctx.fillRect(0, bs - 4, bs, 4);
            ctx.fillStyle = '#d4d4d8'; // spikes
            ctx.beginPath();
            for(let i=0; i<3; i++) {
                const px = i * (bs/3);
                ctx.moveTo(px, bs - 4);
                ctx.lineTo(px + (bs/6), bs - 16);
                ctx.lineTo(px + (bs/3), bs - 4);
            }
            ctx.fill();
            ctx.strokeStyle = '#52525b'; ctx.stroke();
            break;
    }
    ctx.restore();
}

// Generate Icons for UI dynamically
const uiIcons = {};
function generateIcons() {
    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = 32; iconCanvas.height = 32;
    const ictx = iconCanvas.getContext('2d');
    for (let i = 1; i <= 11; i++) {
        ictx.clearRect(0, 0, 32, 32);
        drawBlock(ictx, i, 0, 0, 32, 0);
        uiIcons[i] = iconCanvas.toDataURL();
    }
}
generateIcons();

// ─── UI Setup: Hotbar & Inventory ─────────────────────────────────────────────
function renderHotbar() {
    const container = document.getElementById('hotbar');
    container.innerHTML = '';
    hotbar.forEach((blockId, index) => {
        const div = document.createElement('div');
        div.className = `block-select ${index === activeSlotIndex ? 'active' : ''}`;
        div.innerHTML = `
            <div class="slot-num">${index + 1}</div>
            <span class="block-icon" style="background-image: url('${uiIcons[blockId]}')"></span>
            ${BLOCK_NAMES[blockId]}
        `;
        div.onclick = () => {
            activeSlotIndex = index;
            selectedBlockId = hotbar[activeSlotIndex];
            renderHotbar();
        };
        container.appendChild(div);
    });
}
renderHotbar();

function renderInventoryTab(tabName) {
    const content = document.getElementById('invContent');
    content.innerHTML = '';
    INV_DATA[tabName].forEach(blockId => {
        const div = document.createElement('div');
        div.className = 'block-select';
        div.style.width = '60px';
        div.style.height = '60px';
        div.innerHTML = `
            <span class="block-icon" style="background-image: url('${uiIcons[blockId]}'); width: 32px; height: 32px;"></span>
            <div style="font-size: 0.5rem; margin-top: 4px;">${BLOCK_NAMES[blockId]}</div>
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

// Inventory overlay toggles
const invOverlay = document.getElementById('inventoryOverlay');
document.getElementById('openInvBtn').onclick = () => invOverlay.classList.remove('hidden');
document.getElementById('closeInvBtn').onclick = () => invOverlay.classList.add('hidden');
window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'e' && document.activeElement !== document.getElementById('chatInput')) {
        invOverlay.classList.toggle('hidden');
    }
});

// Tab listeners
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderInventoryTab(btn.getAttribute('data-tab'));
    };
});
renderInventoryTab('blocks');

// ─── Character Renderer ───────────────────────────────────────────────────────
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

    // Default drawing faces RIGHT.
    // BACK ARM
    ctx.save(); ctx.translate(half, yBase + hd + bh * 0.3); ctx.rotate(-armSwing);
    ctx.fillStyle = SHIRT; ctx.fillRect(-lw * 0.5 - bw / 2 - 1, 0, lw, ll);
    ctx.fillStyle = SKIN; ctx.fillRect(-lw * 0.5 - bw / 2 - 1, ll - 1, lw, lw * 1.2); ctx.restore();

    // BACK LEG
    ctx.save(); ctx.translate(half - bs * 0.06, yBase + hd + bh); ctx.rotate(-legSwing);
    ctx.fillStyle = PANTS; ctx.fillRect(-lw, 0, lw * 1.5, ll * 0.9);
    ctx.fillStyle = SHOE; ctx.fillRect(-lw * 0.2, ll * 0.85, foot * 1.2, foot * 0.7); ctx.restore();

    // BODY
    ctx.fillStyle = SHIRT; ctx.fillRect(half - bw, yBase + hd - 2, bw * 2, bh + 4);
    ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(half - bw + 2, yBase + hd + 4, bw * 2 - 4, 2);

    // FRONT LEG
    ctx.save(); ctx.translate(half + bs * 0.06, yBase + hd + bh); ctx.rotate(legSwing);
    ctx.fillStyle = PANTS; ctx.fillRect(-lw, 0, lw * 1.5, ll * 0.9);
    ctx.fillStyle = SHOE; ctx.fillRect(0, ll * 0.85, foot * 1.2, foot * 0.7); ctx.restore();

    // HEAD (Facing Right)
    ctx.fillStyle = SKIN; ctx.fillRect(half - hd / 2, yBase, hd, hd);
    ctx.fillStyle = HAIR; ctx.fillRect(half - hd / 2, yBase, hd, hd * 0.3);
    ctx.fillStyle = EYE; ctx.fillRect(half + hd * 0.15, yBase + hd * 0.35, hd * 0.12, hd * 0.14); // eye on right
    ctx.fillStyle = '#c0392b'; ctx.fillRect(half + hd * 0.15, yBase + hd * 0.65, hd * 0.2, hd * 0.06); // mouth on right

    // FRONT ARM
    ctx.save(); ctx.translate(half, yBase + hd + bh * 0.3); ctx.rotate(armSwing);
    ctx.fillStyle = SHIRT; ctx.fillRect(bw / 2 + 1, 0, lw, ll);
    ctx.fillStyle = SKIN; ctx.fillRect(bw / 2 + 1, ll - 1, lw, lw * 1.2); ctx.restore();

    ctx.restore();

    if (isMine) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(half - bs * 0.3, bs * 0.08, bs * 0.6, bs * 0.85);
    }
}

// ─── HP HUD ───────────────────────────────────────────────────────────────────
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
    world = data.world;
    players = data.players;
    WORLD_WIDTH = data.WORLD_WIDTH;
    WORLD_HEIGHT = data.WORLD_HEIGHT;
    BLOCK_SIZE = data.BLOCK_SIZE;
    MAX_HP = data.MAX_HP;
    MAX_BUILD_RANGE = data.MAX_BUILD_RANGE;
    myHp = MAX_HP;
    resizeCanvas();
    renderHpHud(myHp);
    requestAnimationFrame(gameLoop);
});

socket.on('player_joined', p => { players[p.id] = p; });
socket.on('player_left', id => { delete players[id]; });
socket.on('player_moved', p => { if (players[p.id]) Object.assign(players[p.id], p); });

socket.on('world_update', (data) => {
    const old = world[data.gridY][data.gridX];
    world[data.gridY][data.gridX] = data.blockId;
    if (data.blockId === 0 && old !== 0) {
        spawnParticles(data.gridX, data.gridY, BLOCK_PARTICLE_COLORS[old] || '#888');
    }
});

socket.on('hp_update', (hp) => { myHp = hp; renderHpHud(hp); });

socket.on('player_died', (id) => {
    if (players[id]) {
        players[id].isDead = true;
        players[id].deathTime = Date.now();
        players[id].deathY = players[id].y;
    }
});

socket.on('respawn', (d) => {
    if (players[myId]) {
        players[myId].x = d.x; players[myId].y = d.y;
        players[myId].isDead = false;
    }
    myHp = d.hp; playerVelocityX = 0; playerVelocityY = 0;
    renderHpHud(d.hp);
    showAction('✨ Respawned!', 1500);
});

socket.on('admin_status', (s) => {
    canFly = s.canFly; noclip = s.noclip;
    isAdmin = true;
    document.getElementById('adminBadge').classList.remove('hidden');
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
canvas.addEventListener('mousemove', e => { if (isMouseDown) handleMouseAction(e); });

function handleMouseAction(e) {
    if (!players[myId]) return;
    const p = players[myId];
    if (p.isDead) return;

    const rect = canvas.getBoundingClientRect();
    const worldX = (e.clientX - rect.left) * (canvas.width / rect.width) + camera.x;
    const worldY = (e.clientY - rect.top) * (canvas.height / rect.height) + camera.y;
    const gridX = Math.floor(worldX / BLOCK_SIZE);
    const gridY = Math.floor(worldY / BLOCK_SIZE);

    // Range Check locally
    const px = p.x / BLOCK_SIZE;
    const py = p.y / BLOCK_SIZE;
    const dist = Math.sqrt(Math.pow(px - gridX, 2) + Math.pow(py - gridY, 2));
    if (!isAdmin && dist > MAX_BUILD_RANGE) {
        // Just ignore it, or show a subtle error
        return;
    }

    const now = Date.now();
    if (now - lastBreakTime < 120) return; 
    lastBreakTime = now;

    if (mouseButton === 0) {
        socket.emit('break_block', { gridX, gridY });
        actionAnim = 'break'; actionAnimTimer = 10;
    } else if (mouseButton === 2) {
        socket.emit('place_block', { gridX, gridY, blockId: selectedBlockId });
        actionAnim = 'place'; actionAnimTimer = 10;
    }
}
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ─── Physics ──────────────────────────────────────────────────────────────────
function getBlockAt(px, py) {
    const gx = Math.floor(px / BLOCK_SIZE), gy = Math.floor(py / BLOCK_SIZE);
    if (gx < 0 || gx >= WORLD_WIDTH || gy < 0 || gy >= WORLD_HEIGHT) return 1;
    return world[gy][gx];
}
// Background blocks that can be walked through
function solid(id) { return id !== 0 && id !== 7 && id !== 9 && id !== 10 && id !== 11; } 

function updatePhysics() {
    if (!myId || !players[myId]) return;
    const p = players[myId];
    if (p.isDead) return; // Don't move if dead

    const blockBelow = getBlockAt(p.x + BLOCK_SIZE * 0.4, p.y + BLOCK_SIZE + 1);
    onIce = blockBelow === 8;
    const friction = onIce ? FRICTION_ICE : FRICTION_NORMAL;

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
    skyGrd.addColorStop(0, '#020408'); skyGrd.addColorStop(0.6, '#050d1a'); skyGrd.addColorStop(1, '#0a1628');
    ctx.fillStyle = skyGrd; ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const s of stars) {
        s.blink += s.speed;
        const alpha = 0.4 + 0.5 * Math.sin(s.blink);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillRect(s.x - camera.x * 0.03, s.y - camera.y * 0.01, s.size, s.size);
    }

    const moonX = moon.x - camera.x * 0.05, moonY = moon.y - camera.y * 0.02;
    const moonGlow = ctx.createRadialGradient(moonX, moonY, moon.r * 0.3, moonX, moonY, moon.r * 2.5);
    moonGlow.addColorStop(0, 'rgba(240,240,200,0.12)'); moonGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = moonGlow; ctx.beginPath(); ctx.arc(moonX, moonY, moon.r * 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0f0c8'; ctx.beginPath(); ctx.arc(moonX, moonY, moon.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.arc(moonX + 12, moonY - 8, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(moonX - 10, moonY + 12, 5, 0, Math.PI * 2); ctx.fill();

    for (const c of clouds) {
        c.x += c.speed;
        if (c.x - camera.x * 0.2 > canvas.width + 200) c.x = -c.size * 3;
        ctx.fillStyle = 'rgba(30,40,70,0.65)';
        const cx = c.x - camera.x * 0.2, cy = c.y - camera.y * 0.05;
        ctx.beginPath();
        ctx.arc(cx, cy, c.size, 0, Math.PI * 2);
        ctx.arc(cx + c.size * 0.6, cy - c.size * 0.2, c.size * 0.7, 0, Math.PI * 2);
        ctx.arc(cx - c.size * 0.5, cy + c.size * 0.1, c.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
    }

    const startX = Math.max(0, Math.floor(camera.x / BLOCK_SIZE));
    const endX   = Math.min(WORLD_WIDTH,  Math.ceil((camera.x + canvas.width)  / BLOCK_SIZE));
    const startY = Math.max(0, Math.floor(camera.y / BLOCK_SIZE));
    const endY   = Math.min(WORLD_HEIGHT, Math.ceil((camera.y + canvas.height) / BLOCK_SIZE));

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            const bid = world[y][x];
            if (bid !== 0) drawBlock(ctx, bid, x * BLOCK_SIZE - camera.x, y * BLOCK_SIZE - camera.y, BLOCK_SIZE, t);
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.3; pt.life -= pt.decay;
        if (pt.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = pt.life; ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x - camera.x, pt.y - camera.y, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;

    for (const id in players) {
        const p = players[id];
        let sx = p.x - camera.x;
        let sy = p.y - camera.y;
        
        ctx.save();
        ctx.translate(sx + BLOCK_SIZE / 2, sy + BLOCK_SIZE / 2);

        if (p.isDead) {
            // Death Animation: Ghost flying up and spinning
            const dt = t - p.deathTime;
            sy -= (dt / 15); // float up
            ctx.translate(0, - (dt / 15));
            ctx.rotate(dt / 100); // spin
            ctx.globalAlpha = Math.max(0, 1 - (dt / 2500)); // fade out
            
            // Draw ghost blob
            ctx.fillStyle = '#a8a29e';
            ctx.beginPath(); ctx.arc(0, 0, BLOCK_SIZE/2, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.beginPath(); ctx.arc(-5, -5, 4, 0, Math.PI*2); ctx.arc(5, -5, 4, 0, Math.PI*2); ctx.fill();
        } else {
            const vx = p.vx || 0;
            if (vx > 0.4) p.facingRight = true;
            else if (vx < -0.4) p.facingRight = false;
            
            // If facing left, flip horizontally
            if (!p.facingRight) ctx.scale(-1, 1);
            
            ctx.translate(-BLOCK_SIZE / 2, -BLOCK_SIZE / 2);
            drawCharacter(ctx, BLOCK_SIZE, vx, id === myId ? playerVelocityY : 0, id === myId ? isGrounded : true, actionAnim, actionAnimTimer, id === myId);
        }
        ctx.restore();
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
    li.innerHTML = `<span style="color:${msg.color};font-weight:bold;">Player:</span> ${msg.text}`;
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
