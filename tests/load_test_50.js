const io = require('socket.io-client');
const URL = 'http://localhost:3000';
const CLIENTS = 50;
const RUN_SECONDS = 12;

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function run() {
  console.log(`Starting ${CLIENTS} clients...`);
  const clients = [];
  for (let i=0;i<CLIENTS;i++){
    const name = `Load${i}`;
    const sock = io(URL, { auth: { username: name }, reconnection: false, transports: ['websocket'] });
    const state = { id: null, sock, connected:false, inited:false, events:{ world_update:0, mobs_update:0, item_spawned:0, player_moved:0, other:0 } };

    sock.on('connect', ()=>{ state.connected=true; state.id = sock.id; });
    sock.on('init', (d)=>{ state.inited=true; state.init=d; });
    sock.on('world_update', ()=> state.events.world_update++);
    sock.on('mobs_update', ()=> state.events.mobs_update++);
    sock.on('item_spawned', ()=> state.events.item_spawned++);
    sock.on('player_moved', ()=> state.events.player_moved++);
    sock.onAny(()=> state.events.other++);
    sock.on('connect_error',(e)=> console.error('connect_error', e && e.message));

    clients.push(state);
    await sleep(10); // stagger connects
  }

  // wait for most clients to init
  const waitUntil = Date.now() + 5000;
  while (Date.now() < waitUntil) {
    const ok = clients.filter(c=>c.inited).length;
    if (ok >= Math.floor(CLIENTS*0.8)) break;
    await sleep(200);
  }

  console.log(`${clients.filter(c=>c.inited).length}/${CLIENTS} clients initialized.`);

  // perform rounds of actions: random moves + occasional place block by random client
  const rounds = 6;
  for (let r=0;r<rounds;r++){
    // random moves
    for (const c of clients){
      if (!c.inited) continue;
      const id = c.init.id;
      const player = c.init.players && c.init.players[id];
      if (!player) continue;
      const nx = player.x + (Math.random()*200 - 100);
      const ny = player.y + (Math.random()*200 - 100);
      c.sock.emit('player_move', { x: nx, y: ny, vx: 0 });
    }
    // pick a random client to place a block near itself
    const pick = clients[Math.floor(Math.random()*clients.length)];
    if (pick && pick.inited) {
      const id = pick.init.id;
      const player = pick.init.players && pick.init.players[id];
      if (player) {
        const gx = Math.floor(player.x / (pick.init.BLOCK_SIZE || 32));
        const gy = Math.floor(player.y / (pick.init.BLOCK_SIZE || 32));
        pick.sock.emit('place_block', { gridX: gx+1, gridY: gy, blockId: 4 });
        console.log(`Round ${r}: client ${pick.id||'unknown'} placed block at ${gx+1},${gy}`);
      }
    }
    await sleep(800);
  }

  // wait a bit to collect events
  await sleep(1200);

  // Aggregate results
  const totals = { world_update:0, mobs_update:0, item_spawned:0, player_moved:0, other:0 };
  for (const c of clients){
    for (const k of Object.keys(totals)) totals[k] += (c.events[k] || 0);
  }

  console.log('--- Load test summary ---');
  console.log(`Clients: ${CLIENTS}`);
  console.log(`Rounds: ${rounds}`);
  console.log(`Totals per event (sum across all clients):`);
  console.log(totals);
  console.log('Avg events per client:');
  for (const k of Object.keys(totals)) console.log(`${k}: ${(totals[k]/CLIENTS).toFixed(2)}`);

  // cleanup
  for (const c of clients) c.sock.disconnect();
  process.exit(0);
}

run().catch(e=>{ console.error('Test failed', e); process.exit(1); });
