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
let world = [], players = {}, droppedItems = [], mobs = [], myId = null;
let WORLD_WIDTH = 0, WORLD_HEIGHT = 0, BLOCK_SIZE = 32, MAX_HP = 20, MAX_BUILD_RANGE = 4;
const camera = { x: 0, y: 0 };
let myHp = MAX_HP;
let canFly = false, noclip = false;
let isAdmin = false;
let myInventory = {};

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

// ─── Procedural Block & Item Renderer ──────────────────────────────────────────
function drawBlock(ctx, blockId, sx, sy, bs, time) {
    if (!blockId) return;
    const t = time || 0;
    ctx.save();
    ctx.translate(sx, sy);

    switch(blockId) {
        case 1: // Dirt
            ctx.fillStyle = '#6b3a2a'; ctx.fillRect(0, 0, bs, bs);
            ctx.fillStyle = '#4e2a18';
            ctx.fillRect(4, 6, 5, 4); ctx.fillRect(16, 14, 4, 3); ctx.fillRect(7, 22, 6, 3);
            ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.strokeRect(0, 0, bs, bs);
            break;
        case 2: // Grass
            ctx.fillStyle = '#6b3a2a'; ctx.fillRect(0, 8, bs, bs - 8);
            ctx.fillStyle = '#4e2a18'; ctx.fillRect(4, 14, 4, 3);
            ctx.fillStyle = '#3a7d35'; ctx.fillRect(0, 0, bs, 10);
            ctx.fillStyle = '#4a9e41'; for(let gx=1; gx<bs; gx+=5) ctx.fillRect(gx, 0, 2, 6);
            ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.strokeRect(0, 0, bs, bs);
            break;
        case 3: // Stone
            ctx.fillStyle = '#5a5a5a'; ctx.fillRect(0, 0, bs, bs);
            const cracks = [[1,1,14,14],[16,2,13,13],[1,16,10,13],[12,16,18,13]];
            ctx.fillStyle = '#4a4a4a'; for(const [cx,cy,cw,ch] of cracks) ctx.fillRect(cx,cy,cw,ch);
            ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.strokeRect(0, 0, bs, bs);
            break;
        case 4: // Wood Log
            ctx.fillStyle = '#5c3a21'; ctx.fillRect(0, 0, bs, bs);
            ctx.fillStyle = '#3d2413'; ctx.fillRect(0, 2, bs, 3); ctx.fillRect(0, 18, bs, 3);
            ctx.fillStyle = '#7a4d2e'; ctx.fillRect(0, 7, bs, 2); ctx.fillRect(0, 23, bs, 2);
            ctx.strokeStyle = '#2b180b'; ctx.strokeRect(0, 0, bs, bs);
            break;
        case 5: // Leaves
            ctx.fillStyle = '#1a5e20'; ctx.fillRect(0, 0, bs, bs);
            const leafPos = [[4,3],[12,2],[20,5],[2,14],[10,12],[18,14],[6,22],[16,21]];
            for (const [lx, ly] of leafPos) {
                ctx.fillStyle = `hsl(${120 + Math.sin(lx*ly)*15}, 55%, 35%)`;
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
            lavaGrd.addColorStop(1, '#7b1818');
            ctx.fillStyle = lavaGrd; ctx.fillRect(0, 0, bs, bs);
            ctx.strokeStyle = 'rgba(200,60,0,0.5)'; ctx.strokeRect(0, 0, bs, bs);
            break;
        case 8: // Ice
            const iceGrd = ctx.createLinearGradient(0, 0, bs, bs);
            iceGrd.addColorStop(0, '#e0f7ff'); iceGrd.addColorStop(1, '#7dd3fc');
            ctx.fillStyle = iceGrd; ctx.fillRect(0, 0, bs, bs);
            ctx.strokeStyle = 'rgba(135,206,250,0.8)'; ctx.strokeRect(0, 0, bs, bs);
            break;
        case 9: // Background Wall
            ctx.fillStyle = '#3f3f4e'; ctx.fillRect(0, 0, bs, bs);
            ctx.fillStyle = '#2f2f3a'; ctx.fillRect(0, 7, bs, 2); ctx.fillRect(0, 15, bs, 2);
            ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, 0, bs, bs);
            break;
        case 10: // Door (Animated Glow)
            ctx.fillStyle = '#8a5a32'; ctx.fillRect(0, 0, bs, bs);
            ctx.strokeStyle = '#52341b'; ctx.lineWidth = 2; ctx.strokeRect(2, 2, bs-4, bs-4);
            ctx.strokeRect(6, 6, bs-12, bs/2 - 8);
            ctx.strokeRect(6, bs/2 + 2, bs-12, bs/2 - 8);
            ctx.fillStyle = '#eab308'; ctx.beginPath(); ctx.arc(bs - 6, bs/2, 2.5, 0, Math.PI*2); ctx.fill();
            break;
        case 11: // Spike
            ctx.fillStyle = '#888'; ctx.fillRect(0, bs - 4, bs, 4);
            ctx.fillStyle = '#d4d4d8';
            ctx.beginPath();
            for(let i=0; i<3; i++) {
                const px = i * (bs/3);
                ctx.moveTo(px, bs - 4); ctx.lineTo(px + (bs/6), bs - 16); ctx.lineTo(px + (bs/3), bs - 4);
            }
            ctx.fill(); ctx.strokeStyle = '#52525b'; ctx.stroke();
            break;
        case 12: // Solid Wood Wall
            ctx.fillStyle = '#7a4d2e'; ctx.fillRect(0, 0, bs, bs);
            ctx.fillStyle = '#4a2d16'; ctx.fillRect(0, 0, bs, 3); ctx.fillRect(0, bs-3, bs, 3);
            ctx.fillRect(0, 0, 3, bs); ctx.fillRect(bs-3, 0, 3, bs);
            ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(bs,bs); ctx.moveTo(bs,0); ctx.lineTo(0,bs);
            ctx.strokeStyle = '#3d230e'; ctx.lineWidth = 2; ctx.stroke();
            break;
        case 13: // Solid Stone Wall
            ctx.fillStyle = '#4b5563'; ctx.fillRect(0, 0, bs, bs);
            ctx.fillStyle = '#1f2937'; ctx.fillRect(0, 10, bs, 3); ctx.fillRect(0, 21, bs, 3);
            ctx.fillRect(15, 0, 3, 10); ctx.fillRect(8, 10, 3, 11); ctx.fillRect(24, 10, 3, 11);
            ctx.strokeStyle = '#111827'; ctx.strokeRect(0, 0, bs, bs);
            break;
        case 101: // Wooden Sword
            ctx.fillStyle = '#8B4513'; ctx.fillRect(bs*0.4, bs*0.2, bs*0.2, bs*0.5);
            ctx.fillStyle = '#d97706'; ctx.fillRect(bs*0.25, bs*0.7, bs*0.5, bs*0.1);
            ctx.fillStyle = '#451a03'; ctx.fillRect(bs*0.4, bs*0.8, bs*0.2, bs*0.15);
            break;
        case 102: // Stone Sword
            ctx.fillStyle = '#9ca3af'; ctx.fillRect(bs*0.4, bs*0.15, bs*0.2, bs*0.55);
            ctx.fillStyle = '#4b5563'; ctx.fillRect(bs*0.25, bs*0.7, bs*0.5, bs*0.1);
            ctx.fillStyle = '#1f2937'; ctx.fillRect(bs*0.4, bs*0.8, bs*0.2, bs*0.15);
            break;
    }
    ctx.restore();
}

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

// ─── Procedural Web Audio API BGM & Rain Sound Generator ──────────────────────
class LofiAudioEngine {
    constructor() {
        this.audioCtx = null;
        this.isPlaying = false;
        this.masterGain = null;
        this.rainGain = null;
        this.bgmAudio = null;
        this.currentTrackIndex = 0;
        this.playlist = [
            { title: 'A Cup of Tea', src: 'assets/music/a-cup-of-tea.mp3' },
            { title: 'Cat Caffe', src: 'assets/music/cat-caffe.mp3' },
            { title: 'Rainy Forest', src: 'assets/music/rainy-forest.mp3' }
        ];
    }

    init() {
        if (this.audioCtx) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();

        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = 0.4;
        this.masterGain.connect(this.audioCtx.destination);

        // Rain Noise Generator setup
        this.setupRainNoise();
        this.setupPlaylist();
    }

    setupRainNoise() {
        const bufferSize = 2 * this.audioCtx.sampleRate;
        const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1; // Pink/white noise
        }

        const whiteNoise = this.audioCtx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        // Lowpass filter to make it sound like gentle rain
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        this.rainGain = this.audioCtx.createGain();
        this.rainGain.gain.value = 0.16; // audible, but still behind the music

        whiteNoise.connect(filter);
        filter.connect(this.rainGain);
        this.rainGain.connect(this.masterGain);
        whiteNoise.start();
    }

    setupPlaylist() {
        this.bgmAudio = new Audio();
        this.bgmAudio.preload = 'auto';
        this.bgmAudio.volume = 0.32;
        this.bgmAudio.addEventListener('ended', () => {
            if (!this.isPlaying) return;
            this.currentTrackIndex = (this.currentTrackIndex + 1) % this.playlist.length;
            this.playCurrentTrack();
        });
    }

    playCurrentTrack() {
        const track = this.playlist[this.currentTrackIndex];
        this.bgmAudio.src = track.src;
        this.bgmAudio.play().catch(() => {
            // A user gesture is required by browsers; the audio button supplies it.
        });
        return track;
    }

    playLofiChord() {
        if (!this.isPlaying || !this.audioCtx) return;

        // Smooth Lofi 7th Chord Progression (Cmaj7 -> Am7 -> Dm7 -> G7)
        const chords = [
            [261.63, 329.63, 392.00, 493.88], // Cmaj7
            [220.00, 261.63, 329.63, 392.00], // Am7
            [293.66, 349.23, 440.00, 523.25], // Dm7
            [196.00, 246.94, 293.66, 349.23]  // G7
        ];

        const chord = chords[Math.floor(Math.random() * chords.length)];
        const now = this.audioCtx.currentTime;

        chord.forEach((freq, idx) => {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            const filter = this.audioCtx.createBiquadFilter();

            osc.type = 'triangle'; // Warm lofi tone
            osc.frequency.setValueAtTime(freq * 0.5, now); // 1 octave lower

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(600, now);

            // Envelope: soft attack, long decay
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.11 - (idx * 0.012), now + 0.3);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.8);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now + idx * 0.08); // Slight arpeggio feel
            osc.stop(now + 4.0);
        });
    }

    async toggle() {
        this.init();
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }

        this.isPlaying = !this.isPlaying;
        const btn = document.getElementById('audioToggleBtn');

        if (this.isPlaying) {
            // Restore the master channel after it was muted by a previous toggle.
            this.masterGain.gain.setTargetAtTime(0.4, this.audioCtx.currentTime, 0.05);
            btn.classList.add('active');
            const track = this.playCurrentTrack();
            btn.textContent = `🎵 ${track.title} & Rain: ON`;
        } else {
            btn.classList.remove('active');
            btn.textContent = '🎵 BGM & Rain: OFF';
            this.bgmAudio.pause();
            if (this.masterGain) this.masterGain.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.05);
        }
    }
}

const lofiAudio = new LofiAudioEngine();
document.getElementById('audioToggleBtn').onclick = () => lofiAudio.toggle();

// ─── UI Setup: Hotbar & Inventory ─────────────────────────────────────────────
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
    world = data.world;
    players = data.players;
    droppedItems = data.droppedItems || [];
    mobs = data.mobs || [];
    WORLD_WIDTH = data.WORLD_WIDTH;
    WORLD_HEIGHT = data.WORLD_HEIGHT;
    BLOCK_SIZE = data.BLOCK_SIZE;
    MAX_HP = data.MAX_HP;
    MAX_BUILD_RANGE = data.MAX_BUILD_RANGE;
    myHp = MAX_HP;
    myInventory = data.inventory || {};
    currentGameTime = data.gameTime || 0;
    isNightTime = data.isNight || false;
    resizeCanvas();
    renderHpHud(myHp);
    renderHotbar();
    renderInventoryTab('blocks');
    requestAnimationFrame(gameLoop);
});

socket.on('player_joined', p => { players[p.id] = p; });
socket.on('player_left', id => { delete players[id]; });
socket.on('player_moved', p => { if (players[p.id]) Object.assign(players[p.id], p); });

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
    const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab') || 'blocks';
    renderInventoryTab(activeTab);
});

socket.on('world_update', (data) => {
    const old = world[data.gridY][data.gridX];
    world[data.gridY][data.gridX] = data.blockId;
    if (data.blockId === 0 && old !== 0) {
        spawnParticles(data.gridX, data.gridY, BLOCK_PARTICLE_COLORS[old] || '#888');
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
canvas.addEventListener('mousemove', e => { if (isMouseDown) handleMouseAction(e); });

function handleMouseAction(e) {
    if (!players[myId]) return;
    const p = players[myId];
    if (p.isDead) return;

    const rect = canvas.getBoundingClientRect();
    const worldX = (e.clientX - rect.left) * (canvas.width / rect.width) + camera.x;
    const worldY = (e.clientY - rect.top) * (canvas.height / rect.height) + camera.y;

    if (mouseButton === 0) {
        for (let mob of mobs) {
            if (Math.hypot(worldX - (mob.x + 16), worldY - (mob.y + 16)) < 36) {
                socket.emit('attack_mob', { mobId: mob.id, weaponId: selectedBlockId });
                actionAnim = 'break'; actionAnimTimer = 10;
                return;
            }
        }
    }

    const gridX = Math.floor(worldX / BLOCK_SIZE);
    const gridY = Math.floor(worldY / BLOCK_SIZE);

    const px = p.x / BLOCK_SIZE, py = p.y / BLOCK_SIZE;
    if (!isAdmin && Math.hypot(px - gridX, py - gridY) > MAX_BUILD_RANGE) return;

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
    const blockStanding = getBlockAt(p.x + BLOCK_SIZE / 2, p.y + BLOCK_SIZE / 2);
    const blockFoot = getBlockAt(p.x + BLOCK_SIZE / 2, p.y + BLOCK_SIZE - 4);
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
            const bid = world[y][x];
            if (bid !== 0) drawBlock(ctx, bid, x * BLOCK_SIZE - camera.x, y * BLOCK_SIZE - camera.y, BLOCK_SIZE, t);
        }
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
    name.textContent = 'Player:';
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
