const { parentPort } = require('worker_threads');

let lastSnapshot = { mobs: [], players: {} };
let TICK_MS = 100;

parentPort.on('message', (msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'config') {
        if (msg.tickMs) TICK_MS = msg.tickMs;
    }
    if (msg.type === 'snapshot') {
        lastSnapshot = { mobs: msg.mobs || [], players: msg.players || {} };
    }
});

function computeDecisions(mobs, players) {
    const decisions = [];
    for (const m of mobs) {
        let closest = null;
        let minDist = Number.POSITIVE_INFINITY;
        for (const id in players) {
            const p = players[id];
            if (!p || p.hp <= 0 || p.isAdmin) continue;
            const d = Math.hypot(p.x - m.x, p.y - m.y);
            if (d < minDist) { minDist = d; closest = p; }
        }

        if (closest && minDist < 12 * (msgBlockSize || 32)) {
            // simple chase decision
            const vx = closest.x > m.x + 8 ? 2.5 : (closest.x < m.x - 8 ? -2.5 : 0);
            const attack = minDist < 42;
            decisions.push({ id: m.id, vx, attack, targetId: attack ? closest.id : null });
        } else {
            // wander
            decisions.push({ id: m.id, vx: (m.vx || 0) * 0.8, attack: false, targetId: null });
        }
    }
    return decisions;
}

// Periodically compute decisions and post back
setInterval(() => {
    const dec = computeDecisions(lastSnapshot.mobs || [], lastSnapshot.players || {});
    parentPort.postMessage({ type: 'decisions', decisions: dec });
}, TICK_MS);
