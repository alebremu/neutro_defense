/**
 * level2.js — Degranulation
 * Mechanic: neutrophils patrol and phagocytose bacteria.
 * Right-click to upgrade a neutrophil with 3 granule charges.
 * Upgraded cells auto-fire torpedoes at hyphae.
 * Torpedoes exploding near vessel walls cause plasma leaks + permanent scars.
 * Mid-vessel explosions cause zero tissue damage.
 */

const cv = document.getElementById('gc'), ctx = cv.getContext('2d');
const W = 820, H = 400; cv.width = W; cv.height = H;

// Vessel geometry — wide (190px interior)
const VY1 = 95, VY2 = 285, VCY = 190;
const WALL_DMG_ZONE = 40;

const PLACE_COST  = 26;
const DEGRAN_COST = 15;
const GRANULE_CHARGES = 3;
const DEGRAN_RANGE = 88, DEGRAN_CD = 110, TORP_SPEED = 5.5, TORP_EXPLODE_R = 65;
const PHAGO_RANGE = 44, DIGEST_TIME = 160, MAX_LOAD = 2, PATROL_R = 65;
const WALL_DMG = 9;

const WAVE_CFG = [
  { bact: 14, hyph: 3,  bi: 26, bs: 1.0, hs: 0.5,  bhp: 1 },
  { bact: 22, hyph: 6,  bi: 18, bs: 1.3, hs: 0.6,  bhp: 1 },
  { bact: 38, hyph: 10, bi: 11, bs: 1.7, hs: 0.72, bhp: 1 },
  { bact: 52, hyph: 16, bi: 7,  bs: 2.2, hs: 0.88, bhp: 2 },
];

let towers = [], enemies = [], torpedoes = [], particles = [], leaks = [], scars = [];
let energy = 80, tissueHP = 100, collateral = 0, wave = 0, escaped = 0;
let running = false, gameOver = false;
let waveTimer = 0, spawnedB = 0, spawnedH = 0, wc = WAVE_CFG[0];
let mode = 'place', mx = 0, my = 0;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function wallDist(y) { return Math.min(Math.abs(y - VY1), Math.abs(y - VY2)); }
function nearWall(y) { return wallDist(y) < WALL_DMG_ZONE; }

// ── Scars ──────────────────────────────────────────────────────────
function addScar(x, wall, sev) {
  scars.push({ x: clamp(x + (Math.random()-0.5)*30, 20, W-20), wall, sev: clamp(sev,1,3), r: 6+Math.random()*8, angle: Math.random()*Math.PI*2 });
}
function recordDamage(x, amt) {
  let count = Math.ceil(amt/3), sev = amt>=8?3:amt>=4?2:1;
  for (let i=0; i<count; i++) addScar(x + (Math.random()-0.5)*60, Math.random()<0.5?'top':'bottom', sev);
}
function drawScars() {
  scars.forEach(s => {
    const wy = s.wall==='top'?VY1:VY2, dir = s.wall==='top'?-1:1;
    ctx.save();
    if (s.sev===1) {
      ctx.beginPath(); ctx.ellipse(s.x, wy+dir*3, s.r, s.r*0.5, s.angle, 0, Math.PI*2);
      ctx.fillStyle='rgba(120,40,40,0.2)'; ctx.fill();
    } else if (s.sev===2) {
      ctx.strokeStyle='rgba(140,30,30,0.4)'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.moveTo(s.x, wy);
      const cx1=s.x+(Math.random()-0.5)*8, cy1=wy+dir*(4+Math.random()*5);
      ctx.lineTo(cx1, cy1); ctx.lineTo(s.x+(Math.random()-0.5)*10, wy+dir*(8+Math.random()*6)); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(s.x, wy+dir*2, s.r*1.4, s.r*0.7, s.angle, 0, Math.PI*2);
      ctx.fillStyle='rgba(100,20,20,0.28)'; ctx.fill();
      ctx.strokeStyle='rgba(140,30,30,0.35)'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.moveTo(s.x, wy+dir*4); ctx.lineTo(s.x+(Math.random()-0.5)*6, wy+dir*(10+s.r)); ctx.stroke();
    }
    ctx.restore();
  });
}

// ── Leaks ──────────────────────────────────────────────────────────
function spawnLeak(x, wall) {
  const life = 120 + Math.random()*80;
  leaks.push({ x, wall, life, maxLife: life, drip: 0, wx: x+(Math.random()-0.5)*10 });
  addScar(x, wall, 3);
}
function drawLeaks() {
  leaks.forEach(lk => {
    if (lk.life<=0) return;
    const wy=lk.wall==='top'?VY1:VY2, dir=lk.wall==='top'?-1:1, age=1-lk.life/lk.maxLife;
    ctx.save();
    ctx.strokeStyle='rgba(170,30,30,0.65)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(lk.wx,wy); ctx.lineTo(lk.wx-5,wy+dir*6); ctx.lineTo(lk.wx+4,wy+dir*10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lk.wx+2,wy); ctx.lineTo(lk.wx+7,wy+dir*8); ctx.stroke();
    lk.drip = Math.min(lk.drip+0.22, 9);
    const dripY = wy+dir*(12+lk.drip*1.4);
    ctx.fillStyle=`rgba(195,35,35,${0.65*(1-age*0.55)})`;
    ctx.beginPath(); ctx.ellipse(lk.wx, dripY, lk.drip*0.6+2, lk.drip+2, 0, 0, Math.PI*2); ctx.fill();
    if (Math.floor(lk.life)%16===0) {
      particles.push({ type:'drip', x:lk.wx, y:dripY, vy:dir*(1+Math.random()*0.5), vx:(Math.random()-0.5)*0.4, life:40, maxLife:60 });
      lk.drip=0;
    }
    lk.life--; ctx.restore();
  });
  leaks = leaks.filter(l=>l.life>0);
}

// ── Factories ──────────────────────────────────────────────────────
function mkBact(w) {
  return { type:'bact', x:-18, y:VY1+18+Math.random()*(VY2-VY1-36),
    speed:(1.0+Math.random()*0.4)*w.bs, phase:Math.random()*Math.PI*2,
    hp:w.bhp, maxHp:w.bhp, dead:false, engulfBy:null, engulfT:0, frustT:0 };
}
function mkHypha(w) {
  const len=55+Math.random()*35;
  return { type:'hypha', x:-len-10, y:VY1+18+Math.random()*(VY2-VY1-36),
    speed:(0.35+Math.random()*0.15)*(w.hs/0.5)*0.5, len,
    hp:3, maxHp:3, dead:false, hitT:0 };
}
function mkNeutrophil(x,y) {
  return { x, y,
    vx: 0, vy: 0, wanderAngle: Math.random()*Math.PI*2,
    load:0, digestTimer:0, phRange:PHAGO_RANGE,
    hovered:false, flashT:0, bounceT:0,
    charges:0, maxCharges:0, degranCD:0, degranRange:DEGRAN_RANGE };
}
function mkTorpedo(x,y,tx,ty) {
  const dx=tx-x, dy=ty-y, d=Math.hypot(dx,dy);
  return { x, y, vx:dx/d*TORP_SPEED, vy:dy/d*TORP_SPEED, dead:false, trail:[] };
}

// ── Draw helpers ───────────────────────────────────────────────────
function drawVessel() {
  ctx.fillStyle='rgba(240,153,123,0.07)'; ctx.fillRect(0,0,W,VY1); ctx.fillRect(0,VY2,W,H-VY2);
  ctx.fillStyle='rgba(253,232,221,0.55)'; ctx.fillRect(0,VY1,W,VY2-VY1);
  ctx.fillStyle='rgba(240,120,80,0.16)'; ctx.fillRect(0,VY1-10,W,10); ctx.fillRect(0,VY2,W,10);
  const df = clamp(1-tissueHP/100, 0, 1);
  ctx.strokeStyle=`rgba(${Math.round(180+75*df)},${Math.round(90-60*df)},40,${0.45+df*0.35})`;
  ctx.lineWidth=2.5+df*2;
  ctx.beginPath(); ctx.moveTo(0,VY1); ctx.lineTo(W,VY1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,VY2); ctx.lineTo(W,VY2); ctx.stroke();
  drawScars();
  ctx.strokeStyle='#F0997B'; ctx.lineWidth=1; ctx.globalAlpha=0.15;
  for (let x=60;x<W;x+=90) {
    ctx.beginPath(); ctx.moveTo(x,VCY); ctx.lineTo(x+26,VCY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+21,VCY-4); ctx.lineTo(x+27,VCY); ctx.lineTo(x+21,VCY+4); ctx.stroke();
  }
  ctx.globalAlpha=1;
  ctx.save(); ctx.font='11px system-ui,sans-serif'; ctx.fillStyle='rgba(180,90,40,0.55)';
  ctx.fillText('blood vessel →',8,VY1-13); ctx.fillText('tissue',8,VY1-26); ctx.fillText('tissue',8,VY2+26); ctx.restore();
  ctx.save(); ctx.globalAlpha=0.1;
  [[80,55],[210,68],[370,42],[510,62],[660,50],[750,67],[100,318],[265,330],[425,322],[590,312],[730,328]].forEach(([cx,cy])=>{
    ctx.fillStyle='#F0997B'; ctx.beginPath(); ctx.ellipse(cx,cy,28,17,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#D85A30'; ctx.beginPath(); ctx.arc(cx,cy,6,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#F0997B';
  }); ctx.restore();
}

function drawNeutrophil(t) {
  ctx.save();
  const upgraded = t.maxCharges > 0;
  // Velocity tail
  const spd = Math.hypot(t.vx||0, t.vy||0);
  if (spd > 0.15) {
    const nx=t.vx/spd, ny=t.vy/spd;
    ctx.beginPath(); ctx.moveTo(t.x-nx*10,t.y-ny*10); ctx.lineTo(t.x-nx*18,t.y-ny*18);
    ctx.strokeStyle='rgba(29,158,117,0.28)'; ctx.lineWidth=2; ctx.stroke();
  }
  if (t.hovered) {
    ctx.beginPath(); ctx.arc(t.x,t.y,t.phRange,0,Math.PI*2);
    ctx.strokeStyle='#1D9E75'; ctx.lineWidth=1; ctx.globalAlpha=0.12; ctx.stroke(); ctx.globalAlpha=1;
  }
  if (t.load>0) {
    const fr=t.digestTimer/DIGEST_TIME;
    ctx.beginPath(); ctx.arc(t.x,t.y,20,-Math.PI/2,-Math.PI/2+Math.PI*2*fr);
    ctx.strokeStyle='#EF9F27'; ctx.lineWidth=3; ctx.globalAlpha=0.7; ctx.stroke(); ctx.globalAlpha=1;
  }
  if (t.flashT>0) { ctx.beginPath(); ctx.arc(t.x,t.y,22,0,Math.PI*2); ctx.fillStyle=`rgba(93,202,165,${t.flashT/10*0.35})`; ctx.fill(); t.flashT--; }
  if (t.bounceT>0) { ctx.beginPath(); ctx.arc(t.x,t.y,19,0,Math.PI*2); ctx.fillStyle=`rgba(255,175,0,${t.bounceT/12*0.45})`; ctx.fill(); t.bounceT--; }
  if (upgraded) { ctx.beginPath(); ctx.arc(t.x,t.y,17,0,Math.PI*2); ctx.strokeStyle='#EF9F27'; ctx.lineWidth=2; ctx.globalAlpha=0.5; ctx.stroke(); ctx.globalAlpha=1; }
  const full = t.load >= MAX_LOAD;
  ctx.beginPath(); ctx.arc(t.x,t.y,15,0,Math.PI*2);
  ctx.fillStyle=full?'#FAC775':upgraded?'#9FE1CB':'#5DCAA5'; ctx.fill();
  ctx.strokeStyle=full?'#BA7517':upgraded?'#0F6E56':'#1D9E75'; ctx.lineWidth=2; ctx.stroke();
  ctx.fillStyle=full?'rgba(133,79,11,0.5)':'rgba(15,110,86,0.5)';
  for (let i=0;i<3;i++) { ctx.beginPath(); ctx.arc(t.x+Math.cos(i*2.09)*5,t.y+Math.sin(i*2.09)*3.5,3.5,0,Math.PI*2); ctx.fill(); }
  for (let i=0;i<t.load;i++) { ctx.beginPath(); ctx.arc(t.x-5+i*10,t.y+18,3,0,Math.PI*2); ctx.fillStyle='#E24B4A'; ctx.fill(); }
  if (t.maxCharges>0) {
    for (let i=0;i<t.maxCharges;i++) {
      const dx=(i-(t.maxCharges-1)/2)*9, used=t.maxCharges-t.charges;
      ctx.beginPath(); ctx.arc(t.x+dx,t.y-22,3.5,0,Math.PI*2);
      ctx.fillStyle=i<used?'rgba(186,117,23,0.22)':'#EF9F27'; ctx.fill();
      ctx.strokeStyle='#BA7517'; ctx.lineWidth=1; ctx.stroke();
    }
  }
  if (t.hovered && mode==='degran' && t.maxCharges===0) {
    ctx.beginPath(); ctx.arc(t.x,t.y,20,0,Math.PI*2);
    ctx.strokeStyle='#EF9F27'; ctx.lineWidth=2; ctx.globalAlpha=0.5; ctx.setLineDash([4,3]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha=1;
  }
  ctx.restore();
}

function drawBact(b) {
  if (b.dead) return; ctx.save(); ctx.translate(b.x,b.y);
  const wag=Math.sin(Date.now()/120+b.phase)*3.5;
  ctx.strokeStyle='#F09595'; ctx.lineWidth=1.2; ctx.globalAlpha=0.55;
  ctx.beginPath(); ctx.moveTo(-11,0); ctx.quadraticCurveTo(-18,wag,-24,wag*0.4); ctx.stroke(); ctx.globalAlpha=1;
  const tough=b.maxHp>1;
  ctx.fillStyle=tough?'#A32D2D':'#E24B4A'; ctx.strokeStyle=tough?'#701010':'#A32D2D'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.ellipse(0,0,11,7,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
  if (tough) { ctx.fillStyle=b.hp>1?'#FF8080':'#FFE0E0'; ctx.beginPath(); ctx.arc(0,-12,4,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#A32D2D'; ctx.lineWidth=1; ctx.stroke(); }
  ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(-3,-2,4,2.5,-0.4,0,Math.PI*2); ctx.fill();
  if (b.frustT>0) { ctx.fillStyle=`rgba(255,200,0,${b.frustT/10*0.5})`; ctx.beginPath(); ctx.arc(0,0,14,0,Math.PI*2); ctx.fill(); b.frustT--; }
  ctx.restore();
}

function drawHypha(b) {
  if (b.dead) return; ctx.save();
  const segs=Math.ceil(b.len/14);
  for (let i=0;i<segs;i++) {
    const sx=b.x+i*(b.len/segs), sy=b.y+Math.sin(Date.now()/400+i*0.8)*3;
    ctx.beginPath(); ctx.arc(sx,sy,i===0||i===segs-1?5:7,0,Math.PI*2);
    ctx.fillStyle=b.hitT>0?`rgba(255,255,255,${b.hitT/8*0.7})`:(i%2===0?'#9FE1CB':'#5DCAA5');
    ctx.fill(); ctx.strokeStyle='#1D9E75'; ctx.lineWidth=1; ctx.stroke();
  }
  const hpf=b.hp/b.maxHp;
  ctx.fillStyle='rgba(200,200,200,0.4)'; ctx.fillRect(b.x,b.y-16,b.len,4);
  ctx.fillStyle=hpf>0.5?'#5DCAA5':'#EF9F27'; ctx.fillRect(b.x,b.y-16,b.len*hpf,4);
  if (b.hitT>0) b.hitT--; ctx.restore();
}

function drawTorpedo(t) {
  if (t.dead) return; ctx.save();
  t.trail.forEach((pt,i)=>{ ctx.globalAlpha=i/t.trail.length*0.5; ctx.fillStyle='#EF9F27'; ctx.beginPath(); ctx.arc(pt.x,pt.y,3*(i/t.trail.length),0,Math.PI*2); ctx.fill(); });
  ctx.globalAlpha=1;
  const angle=Math.atan2(t.vy,t.vx); ctx.translate(t.x,t.y); ctx.rotate(angle);
  ctx.fillStyle='#EF9F27'; ctx.strokeStyle='#BA7517'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.ellipse(0,0,9,5,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#BA7517'; ctx.beginPath(); ctx.ellipse(7,0,4,3,0,0,Math.PI*2); ctx.fill(); ctx.restore();
}

function drawParticle(p) {
  ctx.save();
  if (p.type==='engulf') { const f=p.life/p.maxLife; ctx.globalAlpha=f*0.65; ctx.strokeStyle='#5DCAA5'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(p.x,p.y,14*(1-f)+4,0,Math.PI*2); ctx.stroke(); }
  else if (p.type==='pop') { const f=1-p.life/p.maxLife; ctx.globalAlpha=(1-f)*0.6; ctx.fillStyle=p.color||'#5DCAA5'; ctx.beginPath(); ctx.arc(p.x+p.vx*f*16,p.y+p.vy*f*16,2.5,0,Math.PI*2); ctx.fill(); }
  else if (p.type==='explode') { const f=1-p.life/p.maxLife; ctx.globalAlpha=(1-f)*0.5; ctx.strokeStyle='#EF9F27'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(p.x,p.y,TORP_EXPLODE_R*f,0,Math.PI*2); ctx.stroke(); }
  else if (p.type==='shrapnel') { const f=1-p.life/p.maxLife; ctx.globalAlpha=(1-f)*0.7; ctx.fillStyle='#FAC775'; ctx.beginPath(); ctx.arc(p.x+p.vx*f*28,p.y+p.vy*f*28,3,0,Math.PI*2); ctx.fill(); }
  else if (p.type==='drip') { const f=1-p.life/p.maxLife; ctx.globalAlpha=(1-f)*0.75; ctx.fillStyle='rgba(190,30,30,0.8)'; ctx.beginPath(); ctx.arc(p.x+p.vx*p.life*0.3,p.y+p.vy*p.life*0.5,2.5*(1-f*0.5),0,Math.PI*2); ctx.fill(); }
  else if (p.type==='txt') { ctx.globalAlpha=p.life/p.maxLife*0.85; ctx.font='500 12px system-ui,sans-serif'; ctx.fillStyle=p.color||'#1D9E75'; ctx.fillText(p.text,p.x,p.y-(p.maxLife-p.life)*0.65); }
  p.life--; ctx.restore();
}

// ── Torpedo explosion ──────────────────────────────────────────────
function explodeTorpedo(torp) {
  torp.dead = true;
  particles.push({ type:'explode', x:torp.x, y:torp.y, life:28, maxLife:28 });
  for (let i=0;i<18;i++) { const a=Math.random()*Math.PI*2; particles.push({ type:'shrapnel', x:torp.x, y:torp.y, vx:Math.cos(a), vy:Math.sin(a), life:22, maxLife:22 }); }
  enemies.forEach(e => {
    if (e.dead) return;
    const ex=e.type==='hypha'?e.x+e.len/2:e.x;
    if (Math.hypot(ex-torp.x,e.y-torp.y)<TORP_EXPLODE_R) { e.hp-=2; e.hitT=10; if (e.hp<=0) { e.dead=true; for(let i=0;i<8;i++){const a=Math.random()*Math.PI*2;particles.push({type:'pop',x:ex,y:e.y,vx:Math.cos(a),vy:Math.sin(a),life:22,maxLife:22,color:'#EF9F27'});} } }
  });
  if (nearWall(torp.y)) {
    collateral += WALL_DMG; tissueHP = Math.max(0, tissueHP-WALL_DMG);
    recordDamage(torp.x, WALL_DMG);
    spawnTxt(torp.x, torp.y-32, `-${WALL_DMG} tissue ⚠`, '#D85A30');
    const wall=Math.abs(torp.y-VY1)<Math.abs(torp.y-VY2)?'top':'bottom';
    spawnLeak(torp.x, wall); flashCollateral();
    showTip('Vascular damage','Wall-proximity blasts permanently scar the endothelium — plasma leaks into tissue.');
    updateHUD(); if (tissueHP<=0) endGame(false, 'wall');
  }
}

// ── Game tick ──────────────────────────────────────────────────────
function tick() {
  if (!running || gameOver) return;
  waveTimer++;
  if (spawnedB<wc.bact && waveTimer%wc.bi===0) { enemies.push(mkBact(wc)); spawnedB++; }
  const hi=Math.floor(wc.bi*2.6);
  if (spawnedH<wc.hyph && waveTimer%hi===Math.floor(hi*0.4)%hi) { enemies.push(mkHypha(wc)); spawnedH++; }

  enemies.forEach(e => {
    if (e.dead||e.engulfBy) return;
    e.x += e.speed;
    const edge=e.type==='hypha'?e.x+e.len:e.x;
    if (edge>W+10) { e.dead=true; escaped++; tissueHP=Math.max(0,tissueHP-8); recordDamage(W-40,8); spawnTxt(W-80,VCY-10,'-8 tissue','#E24B4A'); updateHUD(); if(tissueHP<=0)endGame(false,'escape'); }
  });

  towers.forEach(t => {
    // Chemotaxis — steer toward nearest bacterium, wander otherwise
    let nearest = null, nearestD = 140;
    enemies.forEach(e => {
      if (e.dead || e.engulfBy || e.type !== 'bact') return;
      const d = Math.hypot(e.x - t.x, e.y - t.y);
      if (d < nearestD) { nearestD = d; nearest = e; }
    });
    if (nearest) {
      const dx = nearest.x - t.x, dy = nearest.y - t.y, d = Math.hypot(dx, dy);
      t.vx = t.vx * 0.85 + (dx/d) * 0.9 * 0.15;
      t.vy = t.vy * 0.85 + (dy/d) * 0.9 * 0.15;
    } else {
      if (Math.random() < 0.04) t.wanderAngle += (Math.random()-0.5)*1.8;
      t.vx = t.vx * 0.9 + Math.cos(t.wanderAngle) * 0.5 * 0.1;
      t.vy = t.vy * 0.9 + Math.sin(t.wanderAngle) * 0.5 * 0.1;
    }
    t.x += t.vx; t.y += t.vy;
    if (t.y < VY1+16) { t.y=VY1+16; t.vy= Math.abs(t.vy)*0.5; t.wanderAngle= Math.random()*Math.PI; }
    if (t.y > VY2-16) { t.y=VY2-16; t.vy=-Math.abs(t.vy)*0.5; t.wanderAngle=-Math.random()*Math.PI; }
    if (t.x < 12)    { t.x=12;    t.vx= Math.abs(t.vx)*0.5; }
    if (t.x > W-12)  { t.x=W-12;  t.vx=-Math.abs(t.vx)*0.5; }

    // Digest
    if (t.load>0) { t.digestTimer--; if(t.digestTimer<=0){const d=t.load;t.load=0;t.digestTimer=0;const r=d*3;energy=Math.min(999,energy+r);spawnTxt(t.x,t.y-26,`+${r} ATP`,'#1D9E75');updateHUD();} }

    // Bounce off hyphae
    enemies.filter(e=>e.type==='hypha'&&!e.dead).forEach(h=>{
      const cx=Math.max(h.x,Math.min(t.x,h.x+h.len));
      if(Math.hypot(t.x-cx,t.y-h.y)<18){
        t.vx=(t.x<h.x+h.len/2?-1:1)*3.0; t.vy=(Math.random()-0.5)*1.5; t.bounceT=10; h.hitT=6;
        if(Math.random()<0.18)showTip('Frustrated phagocytosis','The hypha is too large to engulf — the neutrophil bounces off. This triggers extracellular degranulation!');
      }
    });

    // Phagocytose bacteria
    if (t.load<MAX_LOAD) {
      for (const e of enemies) {
        if(e.dead||e.engulfBy||t.load>=MAX_LOAD||e.type==='hypha') continue;
        if(Math.hypot(e.x-t.x,e.y-t.y)<t.phRange) {
          e.hp--; t.flashT=10;
          particles.push({type:'engulf',x:e.x,y:e.y,life:20,maxLife:20});
          for(let i=0;i<5;i++){const a=Math.random()*Math.PI*2;particles.push({type:'pop',x:e.x,y:e.y,vx:Math.cos(a),vy:Math.sin(a),life:18,maxLife:18,color:'#5DCAA5'});}
          if(e.hp<=0){e.engulfBy=t;e.engulfT=0;t.load++;if(t.digestTimer===0)t.digestTimer=DIGEST_TIME;}
          if(Math.random()<0.2)showTip('Phagocytosis','Pseudopods wrap around the bacterium into a sealed phagosome vacuole.');
          updateHUD(); break;
        }
      }
    }

    // Degranulation — fire at nearest hypha if has charges
    if (t.charges>0 && t.degranCD<=0) {
      let target=null, bestD=t.degranRange;
      enemies.forEach(e=>{if(e.dead||e.type!=='hypha')return;const ex=e.x+e.len/2,d=Math.hypot(ex-t.x,e.y-t.y);if(d<bestD){bestD=d;target=e;}});
      if (target) { torpedoes.push(mkTorpedo(t.x,t.y,target.x+target.len/2,target.y)); t.charges--; t.degranCD=DEGRAN_CD; t.flashT=10; if(Math.random()<0.3)showTip('Degranulation','Granules fuse with the membrane — releasing elastase, MPO, and ROS as a torpedo of destruction.'); }
    }
    if (t.degranCD>0) t.degranCD--;
  });

  torpedoes.forEach(torp => {
    if(torp.dead)return;
    torp.trail.push({x:torp.x,y:torp.y}); if(torp.trail.length>12)torp.trail.shift();
    torp.x+=torp.vx; torp.y+=torp.vy;
    let hit=false;
    enemies.forEach(e=>{if(e.dead||hit)return;const ex=e.type==='hypha'?e.x+e.len/2:e.x;if(Math.hypot(ex-torp.x,e.y-torp.y)<(e.type==='hypha'?e.len/2+10:14))hit=true;});
    if(hit||torp.x>W+20||torp.x<-20||torp.y<VY1-20||torp.y>VY2+20)explodeTorpedo(torp);
  });

  enemies.forEach(e=>{if(!e.engulfBy||e.dead)return;e.x+=(e.engulfBy.x-e.x)*0.18;e.y+=(e.engulfBy.y-e.y)*0.18;if(++e.engulfT>22)e.dead=true;});
  enemies=enemies.filter(e=>!e.dead); torpedoes=torpedoes.filter(t=>!t.dead); particles=particles.filter(p=>p.life>0);

  const total=spawnedB+spawnedH, needed=wc.bact+wc.hyph;
  if (total>=needed && enemies.length===0 && torpedoes.length===0) {
    if (wave>=3) { endGame(true); return; }
    wave++; wc=WAVE_CFG[wave]; spawnedB=0; spawnedH=0; waveTimer=0;
    const bonus=30+wave*8; energy=Math.min(999,energy+bonus); updateHUD();
    showMsg(`Wave ${wave+1} incoming! +${bonus} ATP`);
    if(wave===2)showTip('Sepsis threshold','Accumulated vascular damage can trigger ARDS — even if the infection is cleared.');
    if(wave===3)showTip('Neutrophilic inflammation','Excess degranulation near vessels is implicated in COVID-19 lung damage and ischaemia-reperfusion injury.');
  }
}

function draw() {
  ctx.clearRect(0,0,W,H);
  drawVessel(); drawLeaks();
  towers.forEach(t=>drawNeutrophil(t));
  enemies.forEach(e=>e.type==='hypha'?drawHypha(e):drawBact(e));
  torpedoes.forEach(t=>drawTorpedo(t));
  particles.forEach(p=>drawParticle(p));
  if (running&&!gameOver&&my>VY1+6&&my<VY2-6&&mode==='place') {
    ctx.save(); ctx.globalAlpha=0.38;
    ctx.beginPath(); ctx.arc(mx,my,15,0,Math.PI*2);
    ctx.fillStyle='#5DCAA5'; ctx.fill(); ctx.strokeStyle='#1D9E75'; ctx.lineWidth=2; ctx.stroke(); ctx.restore();
  }
}

function loop() { tick(); draw(); if(!gameOver)requestAnimationFrame(loop); }

// ── Input ──────────────────────────────────────────────────────────
cv.addEventListener('mousemove',e=>{const r=cv.getBoundingClientRect();mx=(e.clientX-r.left)*(W/r.width);my=(e.clientY-r.top)*(H/r.height);towers.forEach(t=>t.hovered=Math.hypot(t.x-mx,t.y-my)<20);});
cv.addEventListener('mouseleave',()=>{mx=0;my=0;towers.forEach(t=>t.hovered=false);});

function applyUpgrade(t) {
  if (t.maxCharges>0) { showMsg('Already upgraded!'); return; }
  if (energy<DEGRAN_COST) { showMsg(`Need ${DEGRAN_COST} ATP for upgrade.`); return; }
  energy-=DEGRAN_COST; t.charges=GRANULE_CHARGES; t.maxCharges=GRANULE_CHARGES; updateHUD();
  showTip('Granule loading','3 torpedo charges loaded. Orange dots show remaining charges — each fires at the nearest hypha in range.');
}

cv.addEventListener('click',e=>{
  if(!running||gameOver)return;
  const r=cv.getBoundingClientRect();
  const cx=(e.clientX-r.left)*(W/r.width),cy=(e.clientY-r.top)*(H/r.height);
  if (mode==='place') {
    if(cy<VY1+6||cy>VY2-6){showMsg('Place neutrophils inside the vessel!');return;}
    for(const t of towers){if(Math.hypot(t.x-cx,t.y-cy)<24){showMsg('Already a neutrophil here!');return;}}
    if(energy<PLACE_COST){showMsg(`Need ${PLACE_COST} ATP.`);return;}
    energy-=PLACE_COST; towers.push(mkNeutrophil(cx,cy)); updateHUD();
  } else {
    const hit=towers.find(t=>Math.hypot(t.x-cx,t.y-cy)<20);
    if(hit)applyUpgrade(hit); else showMsg('Click a neutrophil to upgrade it!');
  }
});
cv.addEventListener('contextmenu',e=>{
  e.preventDefault(); if(!running||gameOver)return;
  const r=cv.getBoundingClientRect();
  const cx=(e.clientX-r.left)*(W/r.width),cy=(e.clientY-r.top)*(H/r.height);
  const hit=towers.find(t=>Math.hypot(t.x-cx,t.y-cy)<20);
  if(hit)applyUpgrade(hit); else showMsg('Right-click a neutrophil to upgrade it!');
});

function setMode(m) {
  mode=m;
  document.getElementById('btn-place').className='tbtn'+(m==='place'?' sel':'');
  document.getElementById('btn-degran').className='tbtn'+(m==='degran'?' sel-amber':'');
  document.getElementById('mode-hint').textContent=m==='place'?'Click vessel to place':'Click/right-click neutrophil to add granule charges (15 ATP)';
}

// ── HUD / messages ─────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('e-val').textContent=Math.round(energy);
  document.getElementById('w-val').textContent=wave+1;
  document.getElementById('esc-val').textContent=escaped;
  document.getElementById('col-val').textContent=collateral;
  const pct=Math.max(0,tissueHP),f=document.getElementById('t-fill');
  f.style.width=pct+'%'; f.style.background=pct>60?'#5DCAA5':pct>30?'#EF9F27':'#E24B4A';
}
let msgT=null;
function showMsg(txt){const el=document.getElementById('msg');el.textContent=txt;el.style.opacity=1;clearTimeout(msgT);msgT=setTimeout(()=>el.style.opacity=0,2600);}
let tipT=null;
function showTip(title,body){document.getElementById('tip-title').textContent=title;document.getElementById('tip-body').textContent=body;const el=document.getElementById('tip');el.style.opacity=1;clearTimeout(tipT);tipT=setTimeout(()=>el.style.opacity=0,5200);}
function spawnTxt(x,y,text,color){particles.push({type:'txt',x,y,text,color,life:38,maxLife:38});}
let flt=null;
function flashCollateral(){const el=document.getElementById('collateral-flash');el.style.opacity=1;clearTimeout(flt);flt=setTimeout(()=>el.style.opacity=0,130);}

// ── Screens ────────────────────────────────────────────────────────
function showBriefing(){document.getElementById('ov').style.display='none';document.getElementById('briefing').style.display='flex';}
function showReady(){
  document.getElementById('briefing').style.display='none';
  const ov=document.getElementById('ov'); ov.style.display='flex';
  ov.querySelector('h2').textContent='Ready?';
  ov.querySelector('p').textContent='Place neutrophils, then right-click to add 3 granule charges (15 ATP each). Upgraded cells auto-fire torpedoes at hyphae — but wall blasts cause permanent plasma leaks!';
  ov.querySelector('button').textContent='Start Level 2';
  ov.querySelector('button').onclick=startGame;
}
function endGame(win, reason) {
  gameOver=true; running=false;
  const ov=document.getElementById('ov'); ov.style.display='flex';
  if (win) {
    ov.querySelector('h2').textContent='Level 2 cleared!';
    ov.querySelector('p').textContent=`Infection controlled. Tissue health: ${Math.round(tissueHP)}%. Collateral: ${collateral} pts. Wall scars: ${scars.length}. Every upgraded neutrophil is a double-edged sword!`;
  } else {
    const reasons={wall:'Torpedo blasts near vessel walls caused fatal scarring and plasma leakage.',escape:'Too many pathogens reached the tissue.'};
    ov.querySelector('h2').textContent='Tissue failure';
    ov.querySelector('p').textContent=(reasons[reason]||reasons.escape)+' Try intercepting hyphae centrally — mid-vessel torpedoes cause no tissue damage at all.';
  }
  ov.querySelector('button').textContent='Play again'; ov.querySelector('button').onclick=reset;
}
function reset() {
  towers=[]; enemies=[]; torpedoes=[]; particles=[]; leaks=[]; scars=[];
  energy=80; tissueHP=100; collateral=0; wave=0; escaped=0;
  waveTimer=0; spawnedB=0; spawnedH=0; wc=WAVE_CFG[0];
  gameOver=false; running=false; setMode('place'); updateHUD();
  const ov=document.getElementById('ov'); ov.style.display='flex';
  ov.querySelector('h2').textContent='Level 2 — Degranulation';
  ov.querySelector('p').innerHTML='Fungal hyphae are <strong>too large to phagocytose</strong>. Right-click any neutrophil to upgrade it with 3 granule charges (15 ATP). Upgraded cells auto-fire torpedoes at hyphae — but explosions near vessel walls cause <strong>plasma leaks and permanent scarring</strong>.';
  ov.querySelector('button').textContent='See enemy briefing'; ov.querySelector('button').onclick=showBriefing;
}
function startGame() {
  document.getElementById('ov').style.display='none';
  running=true; updateHUD();
  showMsg('Right-click a neutrophil to load it with granule charges!');
  requestAnimationFrame(loop);
}
document.getElementById('start-btn').onclick=showBriefing;
updateHUD();
