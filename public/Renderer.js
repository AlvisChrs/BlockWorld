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