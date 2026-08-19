const io = require('socket.io-client');

const URL = 'http://localhost:3000';

function createClient(name) {
    const sock = io(URL, { auth: { username: name }, reconnection: false });
    const state = { name, sock, inited: false, initData: null, events: [] };

    sock.on('connect', () => state.events.push(`connected:${sock.id}`));
    sock.on('init', (d) => { state.inited = true; state.initData = d; state.events.push('init'); });
    sock.on('world_update', (u) => state.events.push(`world_update:${JSON.stringify(u)}`));
    sock.on('item_spawned', (i) => state.events.push(`item_spawned:${i.id||JSON.stringify(i)}`));
    sock.on('mob_spawned', (m) => state.events.push(`mob_spawned:${m.id||JSON.stringify(m)}`));
    sock.on('player_moved', (p) => state.events.push(`player_moved:${p.id}`));
    sock.on('chunks_loaded', (c) => state.events.push(`chunks_loaded:${(c.chunks||[]).length}`));
    sock.on('action_failed', (m) => state.events.push(`action_failed:${m}`));
    sock.on('server_message', (m) => state.events.push(`server_message:${m}`));

    sock.on('connect_error', (err) => state.events.push(`connect_error:${err.message}`));
    sock.on('error', (e) => state.events.push(`error:${e}`));

    return state;
}

(async function run() {
    console.log('Starting two headless clients...');
    const A = createClient('HeadlessA');
    const B = createClient('HeadlessB');

    // wait for both inited
    const waitForInit = () => new Promise((res) => {
        const t = setInterval(() => {
            if (A.inited && B.inited) { clearInterval(t); res(); }
        }, 50);
        setTimeout(() => { clearInterval(t); res(); }, 5000);
    });

    await waitForInit();
    console.log('Both clients init states:', { aInit: A.inited, bInit: B.inited });

    // Determine A position and grid
    const aData = A.initData;
    const bData = B.initData;
    const BLOCK_SIZE = aData.BLOCK_SIZE || 32;

    const aPlayer = aData.players[aData.id];
    if (!aPlayer) {
        console.error('A player missing in init players'); process.exit(1);
    }
    const agx = Math.floor(aPlayer.x / BLOCK_SIZE);
    const agy = Math.floor(aPlayer.y / BLOCK_SIZE);
    console.log('A grid position', agx, agy);

    // Move B far away gradually (avoid anti-teleport protection)
    const farX = 5000; const farY = 100;
    const steps = 80;
    const startBX = B.initData.players[B.initData.id] ? B.initData.players[B.initData.id].x : (10 * BLOCK_SIZE);
    const startBY = B.initData.players[B.initData.id] ? B.initData.players[B.initData.id].y : (15 * BLOCK_SIZE);
    for (let i = 1; i <= steps; i++) {
        const nx = Math.round(startBX + (farX - startBX) * (i / steps));
        const ny = Math.round(startBY + (farY - startBY) * (i / steps));
        B.sock.emit('player_move', { x: nx, y: ny, vx: 0 });
        await new Promise(r => setTimeout(r, 120));
    }
    console.log('Moved B far away gradually');

    // wait briefly to let server process move
    await new Promise(r => setTimeout(r, 300));

    // A tries placing a block near itself, scanning for an empty spot
    let placedAt = null;
    for (let off = 1; off <= 8; off++) {
        const tryX = agx + off;
        A.sock.emit('place_block', { gridX: tryX, gridY: agy, blockId: 4 });
        await new Promise(r => setTimeout(r, 200));
        if (A.events.some(e => e.startsWith('world_update'))) { placedAt = tryX; break; }
    }
    if (placedAt === null) console.log('A failed to place any block nearby');
    else console.log('A placed block at', placedAt, agy);

    // wait to collect any remaining events
    await new Promise(r => setTimeout(r, 400));

    console.log('Client A events:', A.events.slice(-20));
    console.log('Client B events:', B.events.slice(-20));

    const aReceived = A.events.some(e => e.startsWith('world_update'));
    const bReceived = B.events.some(e => e.startsWith('world_update'));

    console.log(`Result: A received world_update? ${aReceived}, B received world_update? ${bReceived}`);

    // Cleanup
    A.sock.disconnect(); B.sock.disconnect();
    process.exit(0);
})();