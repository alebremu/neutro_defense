/**
 * level3.js — NETosis
 * Mechanic: all level 2 mechanics plus NETosis upgrade (60 ATP).
 * Neutrophils now move by chemotaxis — attracted to nearest bacteria.
 * NETosis: prime a neutrophil, then click it again to trigger immediately.
 * Chromatin strand NETs trap bacteria, damage hyphae, but cause
 * ongoing tissue damage that compounds when NETs overlap.
 * Vessel walls accumulate permanent scar marks.
 */

const cv = document.getElementById('gc'), ctx = cv.getContext('2d');
const W = 820, H = 400; cv.width = W; cv.height = H;

const VY1 = 95, VY2 = 285, VCY = 190;
const WALL_DMG_ZONE = 40;

const PLACE_COST  = 26;
const DEGRAN_COST = 15;
const NET_COST    = 60;
const GRANULE_CHARGES = 3;
const DEGRAN_RANGE = 88, DEGRAN_CD = 110, TORP_SPEED = 5.5, TORP_EXPLODE_R = 65;
const PHAGO_RANGE  = 44, DIGEST_TIME = 160, MAX_LOAD = 2;
const WALL_DMG = 9;

// Chemotaxis movement
const ROAM_SPEED     = 0.55;
const ATTRACT_SPEED  = 0.9;
const ATTRACT_RADIUS = 140;
const WANDER_CHANGE  = 0.04;
const WALL_BUFFER    = 18;

// NET parameters
const NET_RADIUS       = 72;
const NET_LIFE         = 2700;  // ~45s at 60fps
const NET_SLOW_BACT    = 0.25;
const NET_SLOW_HYPH    = 0.55;
const NET_TRAP_CHANCE  = 0.003;
const NET_HYPH_DMG_INT = 80;
const NET_HYPH_DMG     = 1;
// Tissue damage — reduced: 1 base + 2 per overlap per pulse
const NET_TISSUE_INT     = 120;
const NET_TISSUE_BASE    = 1;
const NET_TISSUE_OVERLAP = 2;

const WAVE_CFG = [
  { bact: 20, hyph: 4,  bi: 22, bs: 1.1,  hs: 0.55, bhp: 1 },
  { bact: 32, hyph: 7,  bi: 16, bs: 1.4,  hs: 0.65, bhp: 1 },
  { bact: 55, hyph: 11, bi: 9,  bs: 1.85, hs: 0.75, bhp: 1 },
  { bact: 80, hyph: 16, bi: 5,  bs: 2.3,  hs: 0.9,  bhp: 2 },
];

let towers=[], enemies=[], torpedoes=[], particles=[], leaks=[], nets=[], scars=[];
let energy=100, tissueHP=100, collateral=0, wave=0, escaped=0;
let running=false, gameOver=false;
let waveTimer=0, spawnedB=0, spawnedH=0, wc=WAVE_CFG[0];
let mode='place', mx=0, my=0;
let netTissueTick=0, netHyphTick=0;

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function wallDist(y){return Math.min(Math.abs(y-VY1),Math.abs(y-VY2));}
function nearWall(y){return wallDist(y)<WALL_DMG_ZONE;}

// ── Scars ──────────────────────────────────────────────────────────
function addScar(x,wall,sev){scars.push({x:clamp(x+(Math.random()-0.5)*30,20,W-20),wall,sev:clamp(sev,1,3),r:6+Math.random()*8,angle:Math.random()*Math.PI*2});}
function recordDamage(x,amt){const count=Math.ceil(amt/3),sev=amt>=8?3:amt>=4?2:1;for(let i=0;i<count;i++)addScar(x+(Math.random()-0.5)*60,Math.random()<0.5?'top':'bottom',sev);}
function drawScars(){
  scars.forEach(s=>{
    const wy=s.wall==='top'?VY1:VY2,dir=s.wall==='top'?-1:1;
    ctx.save();
    if(s.sev===1){ctx.beginPath();ctx.ellipse(s.x,wy+dir*3,s.r,s.r*0.5,s.angle,0,Math.PI*2);ctx.fillStyle='rgba(120,40,40,0.2)';ctx.fill();}
    else if(s.sev===2){ctx.strokeStyle='rgba(140,30,30,0.4)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(s.x,wy);const cx1=s.x+(Math.random()-0.5)*8,cy1=wy+dir*(4+Math.random()*5);ctx.lineTo(cx1,cy1);ctx.lineTo(s.x+(Math.random()-0.5)*10,wy+dir*(8+Math.random()*6));ctx.stroke();}
    else{ctx.beginPath();ctx.ellipse(s.x,wy+dir*2,s.r*1.4,s.r*0.7,s.angle,0,Math.PI*2);ctx.fillStyle='rgba(100,20,20,0.28)';ctx.fill();ctx.strokeStyle='rgba(140,30,30,0.35)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(s.x,wy+dir*4);ctx.lineTo(s.x+(Math.random()-0.5)*6,wy+dir*(10+s.r));ctx.stroke();}
    ctx.restore();
  });
}

// ── Chromatin NET geometry ─────────────────────────────────────────
function mkNet(x,y){
  const strands=[];
  const num=18+Math.floor(Math.random()*10);
  for(let s=0;s<num;s++){
    const pts=[];let cx=x,cy=y;
    let angle=Math.random()*Math.PI*2;
    const totalLen=NET_RADIUS*(0.4+Math.random()*0.75);
    const numSeg=3+Math.floor(Math.random()*4);
    const segLen=totalLen/numSeg;
    const curliness=0.6+Math.random()*1.4;
    const thickness=0.4+Math.random()*0.9;
    const hasBeads=Math.random()<0.4;
    pts.push({x:cx,y:cy});
    for(let i=0;i<numSeg;i++){
      angle+=(Math.random()-0.5)*curliness;
      if(Math.random()<0.12)angle+=Math.PI*(0.4+Math.random()*0.4);
      const nx=cx+Math.cos(angle)*segLen,ny=cy+Math.sin(angle)*segLen;
      const perp=angle+Math.PI/2,wobble=(Math.random()-0.5)*segLen*0.6;
      pts.push({cp1x:cx+Math.cos(angle)*segLen*0.3+Math.cos(perp)*wobble,cp1y:cy+Math.sin(angle)*segLen*0.3+Math.sin(perp)*wobble,cp2x:nx-Math.cos(angle)*segLen*0.2+Math.cos(perp)*wobble*0.5,cp2y:ny-Math.sin(angle)*segLen*0.2+Math.sin(perp)*wobble*0.5,x:nx,y:ny});
      cx=nx;cy=ny;
    }
    const beads=[];
    if(hasBeads){for(let i=1;i<pts.length;i++){if(Math.random()<0.5){const p=pts[i-1],q=pts[i];beads.push({x:(p.x+q.x)/2+(Math.random()-0.5)*4,y:(p.y+q.y)/2+(Math.random()-0.5)*4,r:1.2+Math.random()*1.0});}}}
    strands.push({pts,thickness,hasBeads,beads});
  }
  const frags=[];
  for(let i=0;i<12;i++){
    const a=Math.random()*NET_RADIUS*0.85,b=Math.random()*Math.PI*2;
    const fx=x+Math.cos(b)*a,fy=y+Math.sin(b)*a;
    const fa=Math.random()*Math.PI*2,fl=8+Math.random()*20;
    const perp=fa+Math.PI/2,fw=(Math.random()-0.5)*fl*0.7;
    frags.push({x1:fx,y1:fy,cpx:fx+Math.cos(fa)*fl*0.5+Math.cos(perp)*fw,cpy:fy+Math.sin(fa)*fl*0.5+Math.sin(perp)*fw,x2:fx+Math.cos(fa)*fl,y2:fy+Math.sin(fa)*fl,thickness:0.3+Math.random()*0.5});
  }
  return{x,y,strands,frags,life:NET_LIFE,maxLife:NET_LIFE,dead:false};
}

function drawNets(){
  nets.forEach(n=>{
    if(n.dead)return;
    const age=1-n.life/n.maxLife;
    const fadeIn=Math.min(1,age*10);
    const fadeOut=n.life<NET_LIFE*0.1?n.life/(NET_LIFE*0.1):1;
    const baseAlpha=fadeIn*fadeOut;
    ctx.save();
    const gr=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,NET_RADIUS*0.9);
    gr.addColorStop(0,`rgba(160,120,255,${baseAlpha*0.10})`);
    gr.addColorStop(0.5,`rgba(120,90,220,${baseAlpha*0.06})`);
    gr.addColorStop(1,'rgba(100,70,200,0)');
    ctx.fillStyle=gr;ctx.beginPath();ctx.arc(n.x,n.y,NET_RADIUS*0.9,0,Math.PI*2);ctx.fill();
    n.strands.forEach(s=>{
      const pts=s.pts;if(pts.length<2)return;
      ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
      for(let i=1;i<pts.length;i++){const p=pts[i];p.cp1x!==undefined?ctx.bezierCurveTo(p.cp1x,p.cp1y,p.cp2x,p.cp2y,p.x,p.y):ctx.lineTo(p.x,p.y);}
      ctx.strokeStyle=`rgba(110,80,210,${baseAlpha*0.6})`;ctx.lineWidth=s.thickness;ctx.lineCap='round';ctx.stroke();
      if(s.hasBeads)s.beads.forEach(b=>{ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fillStyle=`rgba(140,100,230,${baseAlpha*0.65})`;ctx.fill();});
    });
    n.frags.forEach(f=>{ctx.beginPath();ctx.moveTo(f.x1,f.y1);ctx.quadraticCurveTo(f.cpx,f.cpy,f.x2,f.y2);ctx.strokeStyle=`rgba(130,95,215,${baseAlpha*0.38})`;ctx.lineWidth=f.thickness;ctx.lineCap='round';ctx.stroke();});
    // No life arc — fade alone signals decay
    n.life--;if(n.life<=0)n.dead=true;
    ctx.restore();
  });
  nets=nets.filter(n=>!n.dead);
}

function triggerNETosis(t){
  particles.push({type:'netburst',x:t.x,y:t.y,life:32,maxLife:32});
  for(let i=0;i<14;i++){const a=Math.random()*Math.PI*2;particles.push({type:'pop',x:t.x,y:t.y,vx:Math.cos(a),vy:Math.sin(a),life:28,maxLife:28,color:'#7F77DD'});}
  nets.push(mkNet(t.x,t.y));t.dead=true;updateHUD();
  showTip('NETosis','Chromatin explodes out as extracellular traps — the cell sacrifices itself. Strands trap bacteria, damage hyphae, but activate platelets causing immunothrombosis.');
}

// ── NET tick effects ───────────────────────────────────────────────
function tickNetEffects(){
  if(!nets.length)return;
  netHyphTick++;
  const doHyph=netHyphTick>=NET_HYPH_DMG_INT;if(doHyph)netHyphTick=0;
  enemies.forEach(e=>{
    if(e.dead||e.engulfBy)return;
    const ex=e.type==='hypha'?e.x+e.len/2:e.x;
    const inNet=nets.some(n=>!n.dead&&Math.hypot(ex-n.x,e.y-n.y)<NET_RADIUS);
    if(e.type==='bact'){
      if(inNet){e.speed=e.baseSpeed*NET_SLOW_BACT;if(!e.trapped&&Math.random()<NET_TRAP_CHANCE){e.trapped=true;e.speed=0;if(Math.random()<0.3)showTip('Bacterial trapping','NET chromatin physically entangles bacteria — killing them in place with antimicrobial proteins.');}}
      else if(!e.trapped)e.speed=e.baseSpeed;
    }
    if(e.type==='hypha'){
      if(inNet){e.speed=e.baseSpeed*NET_SLOW_HYPH;if(doHyph){e.hp-=NET_HYPH_DMG;e.hitT=8;if(e.hp<=0){e.dead=true;for(let i=0;i<8;i++){const a=Math.random()*Math.PI*2;particles.push({type:'pop',x:ex,y:e.y,vx:Math.cos(a),vy:Math.sin(a),life:22,maxLife:22,color:'#7F77DD'});}if(Math.random()<0.4)showTip('Fungal NET killing','NETs bind β-glucans on the fungal wall, triggering oxidative killing without phagocytosis.');}}}
      else e.speed=e.baseSpeed;
    }
  });
  netTissueTick++;
  if(netTissueTick<NET_TISSUE_INT)return;
  netTissueTick=0;
  nets.forEach(n=>{
    if(n.dead)return;
    const overlaps=nets.filter(o=>!o.dead&&o!==n&&Math.hypot(o.x-n.x,o.y-n.y)<NET_RADIUS*1.5).length;
    const dmg=NET_TISSUE_BASE+overlaps*NET_TISSUE_OVERLAP;
    collateral+=dmg;tissueHP=Math.max(0,tissueHP-dmg);
    recordDamage(n.x,dmg);
    spawnTxt(n.x+(Math.random()-0.5)*36,n.y-18,`-${dmg} clot`,'#7F77DD');
    flashCollateral();
  });
  updateHUD();
  if(tissueHP<=0)endGame(false,'nets');
  if(nets.length>=2&&Math.random()<0.3)showTip('Immunothrombosis','Overlapping NETs activate platelets — as in COVID-19 ARDS and septic coagulopathy.');
}

// ── Factories ──────────────────────────────────────────────────────
function mkBact(w){return{type:'bact',x:-18,y:VY1+18+Math.random()*(VY2-VY1-36),speed:(1.0+Math.random()*0.4)*w.bs,baseSpeed:(1.0+Math.random()*0.4)*w.bs,phase:Math.random()*Math.PI*2,hp:w.bhp,maxHp:w.bhp,dead:false,engulfBy:null,engulfT:0,trapped:false};}
function mkHypha(w){const len=55+Math.random()*35;return{type:'hypha',x:-len-10,y:VY1+18+Math.random()*(VY2-VY1-36),speed:(0.35+Math.random()*0.15)*(w.hs/0.5)*0.5,baseSpeed:(0.35+Math.random()*0.15)*(w.hs/0.5)*0.5,len,hp:3,maxHp:3,dead:false,hitT:0};}
function mkNeutrophil(x,y){return{x,y,vx:0,vy:0,wanderAngle:Math.random()*Math.PI*2,load:0,digestTimer:0,phRange:PHAGO_RANGE,hovered:false,flashT:0,bounceVx:0,bounceT:0,charges:0,maxCharges:0,degranCD:0,degranRange:DEGRAN_RANGE,netReady:false,dead:false};}
function mkTorpedo(x,y,tx,ty){const dx=tx-x,dy=ty-y,d=Math.hypot(dx,dy);return{x,y,vx:dx/d*TORP_SPEED,vy:dy/d*TORP_SPEED,dead:false,trail:[]};}

// ── Chemotaxis movement ────────────────────────────────────────────
function moveNeutrophil(t){
  if(t.dead)return;
  if(t.bounceVx!==0){t.x+=t.bounceVx;t.bounceVx*=0.78;if(Math.abs(t.bounceVx)<0.05)t.bounceVx=0;return;}
  let nearest=null,nearestD=ATTRACT_RADIUS;
  enemies.forEach(e=>{if(e.dead||e.engulfBy||e.trapped||e.type!=='bact')return;const d=Math.hypot(e.x-t.x,e.y-t.y);if(d<nearestD){nearestD=d;nearest=e;}});
  if(nearest){const dx=nearest.x-t.x,dy=nearest.y-t.y,d=Math.hypot(dx,dy);t.vx=t.vx*0.85+(dx/d)*ATTRACT_SPEED*0.15;t.vy=t.vy*0.85+(dy/d)*ATTRACT_SPEED*0.15;}
  else{if(Math.random()<WANDER_CHANGE)t.wanderAngle+=(Math.random()-0.5)*1.8;t.vx=t.vx*0.9+Math.cos(t.wanderAngle)*ROAM_SPEED*0.1;t.vy=t.vy*0.9+Math.sin(t.wanderAngle)*ROAM_SPEED*0.1;}
  t.x+=t.vx;t.y+=t.vy;
  if(t.y<VY1+WALL_BUFFER){t.y=VY1+WALL_BUFFER;t.vy=Math.abs(t.vy)*0.5;t.wanderAngle=Math.random()*Math.PI;}
  if(t.y>VY2-WALL_BUFFER){t.y=VY2-WALL_BUFFER;t.vy=-Math.abs(t.vy)*0.5;t.wanderAngle=-Math.random()*Math.PI;}
  if(t.x<12){t.x=12;t.vx=Math.abs(t.vx)*0.5;}
  if(t.x>W-12){t.x=W-12;t.vx=-Math.abs(t.vx)*0.5;}
}

// ── Draw vessel ────────────────────────────────────────────────────
function drawVessel(){
  ctx.fillStyle='rgba(240,153,123,0.07)';ctx.fillRect(0,0,W,VY1);ctx.fillRect(0,VY2,W,H-VY2);
  ctx.fillStyle='rgba(253,232,221,0.55)';ctx.fillRect(0,VY1,W,VY2-VY1);
  ctx.fillStyle='rgba(240,120,80,0.16)';ctx.fillRect(0,VY1-10,W,10);ctx.fillRect(0,VY2,W,10);
  const df=clamp(1-tissueHP/100,0,1);
  ctx.strokeStyle=`rgba(${Math.round(180+75*df)},${Math.round(90-60*df)},40,${0.45+df*0.35})`;ctx.lineWidth=2.5+df*2;
  ctx.beginPath();ctx.moveTo(0,VY1);ctx.lineTo(W,VY1);ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,VY2);ctx.lineTo(W,VY2);ctx.stroke();
  drawScars();
  ctx.strokeStyle='#F0997B';ctx.lineWidth=1;ctx.globalAlpha=0.15;
  for(let x=60;x<W;x+=90){ctx.beginPath();ctx.moveTo(x,VCY);ctx.lineTo(x+26,VCY);ctx.stroke();ctx.beginPath();ctx.moveTo(x+21,VCY-4);ctx.lineTo(x+27,VCY);ctx.lineTo(x+21,VCY+4);ctx.stroke();}
  ctx.globalAlpha=1;
  ctx.save();ctx.font='11px system-ui,sans-serif';ctx.fillStyle='rgba(180,90,40,0.55)';
  ctx.fillText('blood vessel →',8,VY1-13);ctx.fillText('tissue',8,VY1-26);ctx.fillText('tissue',8,VY2+26);ctx.restore();
  ctx.save();ctx.globalAlpha=0.1;
  [[80,55],[210,68],[370,42],[510,62],[660,50],[750,67],[100,318],[265,330],[425,322],[590,312],[730,328]].forEach(([cx,cy])=>{
    ctx.fillStyle='#F0997B';ctx.beginPath();ctx.ellipse(cx,cy,28,17,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#D85A30';ctx.beginPath();ctx.arc(cx,cy,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#F0997B';
  });ctx.restore();
}

// ── Draw neutrophil ────────────────────────────────────────────────
function drawNeutrophil(t){
  if(t.dead)return;
  ctx.save();
  const hasDeg=t.maxCharges>0,hasNet=t.netReady;
  const spd=Math.hypot(t.vx,t.vy);
  if(spd>0.15){const nx=t.vx/spd,ny=t.vy/spd;ctx.beginPath();ctx.moveTo(t.x-nx*10,t.y-ny*10);ctx.lineTo(t.x-nx*18,t.y-ny*18);ctx.strokeStyle='rgba(29,158,117,0.28)';ctx.lineWidth=2;ctx.stroke();}
  if(t.hovered){ctx.beginPath();ctx.arc(t.x,t.y,t.phRange,0,Math.PI*2);ctx.strokeStyle='#1D9E75';ctx.lineWidth=1;ctx.globalAlpha=0.1;ctx.stroke();ctx.globalAlpha=1;}
  if(t.load>0){const fr=t.digestTimer/DIGEST_TIME;ctx.beginPath();ctx.arc(t.x,t.y,20,-Math.PI/2,-Math.PI/2+Math.PI*2*fr);ctx.strokeStyle='#EF9F27';ctx.lineWidth=3;ctx.globalAlpha=0.7;ctx.stroke();ctx.globalAlpha=1;}
  if(t.flashT>0){ctx.beginPath();ctx.arc(t.x,t.y,22,0,Math.PI*2);ctx.fillStyle=`rgba(93,202,165,${t.flashT/10*0.35})`;ctx.fill();t.flashT--;}
  if(t.bounceT>0){ctx.beginPath();ctx.arc(t.x,t.y,19,0,Math.PI*2);ctx.fillStyle=`rgba(255,175,0,${t.bounceT/12*0.45})`;ctx.fill();t.bounceT--;}
  if(hasDeg){ctx.beginPath();ctx.arc(t.x,t.y,17,0,Math.PI*2);ctx.strokeStyle='#EF9F27';ctx.lineWidth=2;ctx.globalAlpha=0.5;ctx.stroke();ctx.globalAlpha=1;}
  if(hasNet){
    ctx.beginPath();ctx.arc(t.x,t.y,19,0,Math.PI*2);ctx.strokeStyle='#7F77DD';ctx.lineWidth=2;ctx.globalAlpha=0.7;ctx.stroke();ctx.globalAlpha=1;
    const pulse=0.4+0.3*Math.sin(Date.now()/200);
    ctx.beginPath();ctx.arc(t.x,t.y,22,0,Math.PI*2);ctx.strokeStyle=`rgba(127,119,221,${pulse})`;ctx.lineWidth=1.5;ctx.stroke();
  }
  const full=t.load>=MAX_LOAD;
  ctx.beginPath();ctx.arc(t.x,t.y,15,0,Math.PI*2);
  ctx.fillStyle=full?'#FAC775':hasNet?'#AFA9EC':hasDeg?'#9FE1CB':'#5DCAA5';ctx.fill();
  ctx.strokeStyle=full?'#BA7517':hasNet?'#534AB7':hasDeg?'#0F6E56':'#1D9E75';ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='rgba(60,52,137,0.4)';
  for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(t.x+Math.cos(i*2.09)*5,t.y+Math.sin(i*2.09)*3.5,3.5,0,Math.PI*2);ctx.fill();}
  for(let i=0;i<t.load;i++){ctx.beginPath();ctx.arc(t.x-5+i*10,t.y+18,3,0,Math.PI*2);ctx.fillStyle='#E24B4A';ctx.fill();}
  if(t.maxCharges>0){for(let i=0;i<t.maxCharges;i++){const dx=(i-(t.maxCharges-1)/2)*9,used=t.maxCharges-t.charges;ctx.beginPath();ctx.arc(t.x+dx,t.y-22,3.5,0,Math.PI*2);ctx.fillStyle=i<used?'rgba(186,117,23,0.22)':'#EF9F27';ctx.fill();ctx.strokeStyle='#BA7517';ctx.lineWidth=1;ctx.stroke();}}
  if(hasNet){
    ctx.beginPath();ctx.arc(t.x,t.y-23,4,0,Math.PI*2);ctx.fillStyle='#7F77DD';ctx.fill();ctx.strokeStyle='#3C3489';ctx.lineWidth=1;ctx.stroke();
    if(t.hovered&&mode==='net'){ctx.font='500 10px system-ui,sans-serif';ctx.fillStyle='#534AB7';ctx.textAlign='center';ctx.fillText('click to fire!',t.x,t.y-34);ctx.textAlign='left';}
  }
  if(t.hovered&&(mode==='degran'||mode==='net')&&!hasNet){ctx.beginPath();ctx.arc(t.x,t.y,20,0,Math.PI*2);ctx.strokeStyle=mode==='net'?'#7F77DD':'#EF9F27';ctx.lineWidth=2;ctx.globalAlpha=0.5;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;}
  ctx.restore();
}

// ── Draw enemies ───────────────────────────────────────────────────
function drawBact(b){
  if(b.dead)return;ctx.save();ctx.translate(b.x,b.y);
  if(!b.trapped){const wag=Math.sin(Date.now()/120+b.phase)*3.5;ctx.strokeStyle='#F09595';ctx.lineWidth=1.2;ctx.globalAlpha=0.55;ctx.beginPath();ctx.moveTo(-11,0);ctx.quadraticCurveTo(-18,wag,-24,wag*0.4);ctx.stroke();ctx.globalAlpha=1;}
  const tough=b.maxHp>1;
  ctx.fillStyle=b.trapped?'rgba(120,110,210,0.85)':tough?'#A32D2D':'#E24B4A';
  ctx.strokeStyle=b.trapped?'#3C3489':tough?'#701010':'#A32D2D';
  ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,0,11,7,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  if(tough&&!b.trapped){ctx.fillStyle=b.hp>1?'#FF8080':'#FFE0E0';ctx.beginPath();ctx.arc(0,-12,4,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#A32D2D';ctx.lineWidth=1;ctx.stroke();}
  ctx.fillStyle='rgba(255,255,255,0.2)';ctx.beginPath();ctx.ellipse(-3,-2,4,2.5,-0.4,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function drawHypha(b){
  if(b.dead)return;ctx.save();
  const segs=Math.ceil(b.len/14);
  for(let i=0;i<segs;i++){const sx=b.x+i*(b.len/segs),sy=b.y+Math.sin(Date.now()/400+i*0.8)*3;ctx.beginPath();ctx.arc(sx,sy,i===0||i===segs-1?5:7,0,Math.PI*2);ctx.fillStyle=b.hitT>0?`rgba(180,160,255,${b.hitT/8*0.8})`:(i%2===0?'#9FE1CB':'#5DCAA5');ctx.fill();ctx.strokeStyle='#1D9E75';ctx.lineWidth=1;ctx.stroke();}
  const hpf=b.hp/b.maxHp;
  ctx.fillStyle='rgba(200,200,200,0.4)';ctx.fillRect(b.x,b.y-16,b.len,4);
  ctx.fillStyle=hpf>0.5?'#5DCAA5':'#EF9F27';ctx.fillRect(b.x,b.y-16,b.len*hpf,4);
  if(b.hitT>0)b.hitT--;ctx.restore();
}
function drawTorpedo(t){
  if(t.dead)return;ctx.save();
  t.trail.forEach((pt,i)=>{ctx.globalAlpha=i/t.trail.length*0.5;ctx.fillStyle='#EF9F27';ctx.beginPath();ctx.arc(pt.x,pt.y,3*(i/t.trail.length),0,Math.PI*2);ctx.fill();});
  ctx.globalAlpha=1;const angle=Math.atan2(t.vy,t.vx);ctx.translate(t.x,t.y);ctx.rotate(angle);
  ctx.fillStyle='#EF9F27';ctx.strokeStyle='#BA7517';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,0,9,5,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#BA7517';ctx.beginPath();ctx.ellipse(7,0,4,3,0,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawParticle(p){
  ctx.save();
  if(p.type==='engulf'){const f=p.life/p.maxLife;ctx.globalAlpha=f*0.65;ctx.strokeStyle='#5DCAA5';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,14*(1-f)+4,0,Math.PI*2);ctx.stroke();}
  else if(p.type==='pop'){const f=1-p.life/p.maxLife;ctx.globalAlpha=(1-f)*0.6;ctx.fillStyle=p.color||'#5DCAA5';ctx.beginPath();ctx.arc(p.x+p.vx*f*16,p.y+p.vy*f*16,2.5,0,Math.PI*2);ctx.fill();}
  else if(p.type==='explode'){const f=1-p.life/p.maxLife;ctx.globalAlpha=(1-f)*0.5;ctx.strokeStyle='#EF9F27';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(p.x,p.y,TORP_EXPLODE_R*f,0,Math.PI*2);ctx.stroke();}
  else if(p.type==='shrapnel'){const f=1-p.life/p.maxLife;ctx.globalAlpha=(1-f)*0.7;ctx.fillStyle='#FAC775';ctx.beginPath();ctx.arc(p.x+p.vx*f*28,p.y+p.vy*f*28,3,0,Math.PI*2);ctx.fill();}
  else if(p.type==='netburst'){const f=1-p.life/p.maxLife;ctx.globalAlpha=(1-f)*0.55;ctx.strokeStyle='#7F77DD';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,NET_RADIUS*f,0,Math.PI*2);ctx.stroke();}
  else if(p.type==='drip'){const f=1-p.life/p.maxLife;ctx.globalAlpha=(1-f)*0.75;ctx.fillStyle='rgba(190,30,30,0.8)';ctx.beginPath();ctx.arc(p.x+p.vx*p.life*0.3,p.y+p.vy*p.life*0.5,2.5*(1-f*0.5),0,Math.PI*2);ctx.fill();}
  else if(p.type==='txt'){ctx.globalAlpha=p.life/p.maxLife*0.85;ctx.font='500 12px system-ui,sans-serif';ctx.fillStyle=p.color||'#1D9E75';ctx.fillText(p.text,p.x,p.y-(p.maxLife-p.life)*0.65);}
  p.life--;ctx.restore();
}

// ── Leaks ──────────────────────────────────────────────────────────
function spawnLeak(x,wall){const life=120+Math.random()*80;leaks.push({x,wall,life,maxLife:life,drip:0,wx:x+(Math.random()-0.5)*10});addScar(x,wall,3);}
function drawLeaks(){
  leaks.forEach(lk=>{
    if(lk.life<=0)return;
    const wy=lk.wall==='top'?VY1:VY2,dir=lk.wall==='top'?-1:1,age=1-lk.life/lk.maxLife;
    ctx.save();ctx.strokeStyle='rgba(170,30,30,0.65)';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(lk.wx,wy);ctx.lineTo(lk.wx-5,wy+dir*6);ctx.lineTo(lk.wx+4,wy+dir*10);ctx.stroke();
    ctx.beginPath();ctx.moveTo(lk.wx+2,wy);ctx.lineTo(lk.wx+7,wy+dir*8);ctx.stroke();
    lk.drip=Math.min(lk.drip+0.22,9);const dripY=wy+dir*(12+lk.drip*1.4);
    ctx.fillStyle=`rgba(195,35,35,${0.65*(1-age*0.55)})`;ctx.beginPath();ctx.ellipse(lk.wx,dripY,lk.drip*0.6+2,lk.drip+2,0,0,Math.PI*2);ctx.fill();
    if(Math.floor(lk.life)%16===0){particles.push({type:'drip',x:lk.wx,y:dripY,vy:dir*(1+Math.random()*0.5),vx:(Math.random()-0.5)*0.4,life:40,maxLife:60});lk.drip=0;}
    lk.life--;ctx.restore();
  });
  leaks=leaks.filter(l=>l.life>0);
}

// ── Torpedo explode ────────────────────────────────────────────────
function explodeTorpedo(torp){
  torp.dead=true;
  particles.push({type:'explode',x:torp.x,y:torp.y,life:28,maxLife:28});
  for(let i=0;i<18;i++){const a=Math.random()*Math.PI*2;particles.push({type:'shrapnel',x:torp.x,y:torp.y,vx:Math.cos(a),vy:Math.sin(a),life:22,maxLife:22});}
  enemies.forEach(e=>{if(e.dead)return;const ex=e.type==='hypha'?e.x+e.len/2:e.x;if(Math.hypot(ex-torp.x,e.y-torp.y)<TORP_EXPLODE_R){e.hp-=2;e.hitT=10;if(e.hp<=0){e.dead=true;for(let i=0;i<8;i++){const a=Math.random()*Math.PI*2;particles.push({type:'pop',x:ex,y:e.y,vx:Math.cos(a),vy:Math.sin(a),life:22,maxLife:22,color:'#EF9F27'});}}}});
  if(nearWall(torp.y)){
    collateral+=WALL_DMG;tissueHP=Math.max(0,tissueHP-WALL_DMG);recordDamage(torp.x,WALL_DMG);
    spawnTxt(torp.x,torp.y-32,`-${WALL_DMG} tissue ⚠`,'#D85A30');
    const wall=Math.abs(torp.y-VY1)<Math.abs(torp.y-VY2)?'top':'bottom';
    spawnLeak(torp.x,wall);flashCollateral();showTip('Vascular damage','Wall-proximity blasts permanently scar the endothelium.');updateHUD();if(tissueHP<=0)endGame(false,'wall');
  }
}

// ── Game tick ──────────────────────────────────────────────────────
function tick(){
  if(!running||gameOver)return;
  waveTimer++;
  if(spawnedB<wc.bact&&waveTimer%wc.bi===0){enemies.push(mkBact(wc));spawnedB++;}
  const hi=Math.floor(wc.bi*2.6);
  if(spawnedH<wc.hyph&&waveTimer%hi===Math.floor(hi*0.4)%hi){enemies.push(mkHypha(wc));spawnedH++;}
  tickNetEffects();
  enemies.forEach(e=>{if(e.dead||e.engulfBy||e.trapped)return;e.x+=e.speed;const edge=e.type==='hypha'?e.x+e.len:e.x;if(edge>W+10){e.dead=true;escaped++;tissueHP=Math.max(0,tissueHP-8);recordDamage(W-40,8);spawnTxt(W-80,VCY-10,'-8 tissue','#E24B4A');updateHUD();if(tissueHP<=0)endGame(false,'escape');}});
  towers.forEach(t=>{
    if(t.dead)return;
    moveNeutrophil(t);
    enemies.filter(e=>e.type==='hypha'&&!e.dead).forEach(h=>{const cx=Math.max(h.x,Math.min(t.x,h.x+h.len));if(Math.hypot(t.x-cx,t.y-h.y)<18){t.vx=(t.x<h.x+h.len/2?-1:1)*2.5;t.vy=(Math.random()-0.5)*1.5;t.bounceT=10;h.hitT=6;if(Math.random()<0.15)showTip('Frustrated phagocytosis','Too large to engulf — the neutrophil bounces off, sometimes releasing granules extracellularly.');}});
    if(t.load>0){t.digestTimer--;if(t.digestTimer<=0){const d=t.load;t.load=0;t.digestTimer=0;const r=d*3;energy=Math.min(999,energy+r);spawnTxt(t.x,t.y-26,`+${r} ATP`,'#1D9E75');updateHUD();}}
    if(t.load<MAX_LOAD){for(const e of enemies){if(e.dead||e.engulfBy||t.load>=MAX_LOAD||e.type==='hypha')continue;if(Math.hypot(e.x-t.x,e.y-t.y)<t.phRange){e.hp--;t.flashT=10;particles.push({type:'engulf',x:e.x,y:e.y,life:20,maxLife:20});for(let i=0;i<5;i++){const a=Math.random()*Math.PI*2;particles.push({type:'pop',x:e.x,y:e.y,vx:Math.cos(a),vy:Math.sin(a),life:18,maxLife:18,color:'#5DCAA5'});}if(e.hp<=0){e.engulfBy=t;e.engulfT=0;t.load++;if(t.digestTimer===0)t.digestTimer=DIGEST_TIME;}updateHUD();break;}}}
    if(t.charges>0&&t.degranCD<=0){let target=null,bestD=t.degranRange;enemies.forEach(e=>{if(e.dead||e.type!=='hypha')return;const ex=e.x+e.len/2,d=Math.hypot(ex-t.x,e.y-t.y);if(d<bestD){bestD=d;target=e;}});if(target){torpedoes.push(mkTorpedo(t.x,t.y,target.x+target.len/2,target.y));t.charges--;t.degranCD=DEGRAN_CD;t.flashT=10;}}
    if(t.degranCD>0)t.degranCD--;
  });
  torpedoes.forEach(torp=>{if(torp.dead)return;torp.trail.push({x:torp.x,y:torp.y});if(torp.trail.length>12)torp.trail.shift();torp.x+=torp.vx;torp.y+=torp.vy;let hit=false;enemies.forEach(e=>{if(e.dead||hit)return;const ex=e.type==='hypha'?e.x+e.len/2:e.x;if(Math.hypot(ex-torp.x,e.y-torp.y)<(e.type==='hypha'?e.len/2+10:14))hit=true;});if(hit||torp.x>W+20||torp.x<-20||torp.y<VY1-20||torp.y>VY2+20)explodeTorpedo(torp);});
  enemies.forEach(e=>{if(!e.engulfBy||e.dead)return;e.x+=(e.engulfBy.x-e.x)*0.18;e.y+=(e.engulfBy.y-e.y)*0.18;if(++e.engulfT>22)e.dead=true;});
  enemies=enemies.filter(e=>!e.dead);torpedoes=torpedoes.filter(t=>!t.dead);particles=particles.filter(p=>p.life>0);towers=towers.filter(t=>!t.dead);
  document.getElementById('net-val').textContent=nets.length;
  const total=spawnedB+spawnedH,needed=wc.bact+wc.hyph;
  if(total>=needed&&enemies.length===0&&torpedoes.length===0){
    if(wave>=3){endGame(true);return;}
    wave++;wc=WAVE_CFG[wave];spawnedB=0;spawnedH=0;waveTimer=0;
    const bonus=35+wave*8;energy=Math.min(999,energy+bonus);updateHUD();showMsg(`Wave ${wave+1} incoming! +${bonus} ATP`);
    if(wave===2)showTip('NET saturation','Overlapping NETs compound scarring and clotting rapidly — spread them out.');
    if(wave===3)showTip('Septic coagulopathy','NET-driven DIC causes organ-wide clotting — sometimes fatal even after infection is gone.');
  }
}

function draw(){
  ctx.clearRect(0,0,W,H);
  drawVessel();drawNets();drawLeaks();
  towers.forEach(t=>drawNeutrophil(t));
  enemies.forEach(e=>e.type==='hypha'?drawHypha(e):drawBact(e));
  torpedoes.forEach(t=>drawTorpedo(t));
  particles.forEach(p=>drawParticle(p));
  if(running&&!gameOver&&mode==='place'&&my>VY1+6&&my<VY2-6){ctx.save();ctx.globalAlpha=0.35;ctx.beginPath();ctx.arc(mx,my,15,0,Math.PI*2);ctx.fillStyle='#5DCAA5';ctx.fill();ctx.strokeStyle='#1D9E75';ctx.lineWidth=2;ctx.stroke();ctx.restore();}
}
function loop(){tick();draw();if(!gameOver)requestAnimationFrame(loop);}

// ── Input ──────────────────────────────────────────────────────────
cv.addEventListener('mousemove',e=>{const r=cv.getBoundingClientRect();mx=(e.clientX-r.left)*(W/r.width);my=(e.clientY-r.top)*(H/r.height);towers.forEach(t=>t.hovered=!t.dead&&Math.hypot(t.x-mx,t.y-my)<20);});
cv.addEventListener('mouseleave',()=>{mx=0;my=0;towers.forEach(t=>t.hovered=false);});

function applyUpgrade(t){
  if(!t||t.dead)return;
  if(mode==='degran'){
    if(t.maxCharges>0){showMsg('Already has granule charges!');return;}
    if(t.netReady){showMsg("Can't combine with NETosis!");return;}
    if(energy<DEGRAN_COST){showMsg(`Need ${DEGRAN_COST} ATP.`);return;}
    energy-=DEGRAN_COST;t.charges=GRANULE_CHARGES;t.maxCharges=GRANULE_CHARGES;updateHUD();
    showTip('Granule loading','3 torpedo charges loaded — fires at nearest hypha.');
  } else if(mode==='net'){
    if(t.netReady){triggerNETosis(t);return;}
    if(t.maxCharges>0){showMsg("Can't combine with degranulation!");return;}
    if(energy<NET_COST){showMsg(`Need ${NET_COST} ATP for NETosis.`);return;}
    energy-=NET_COST;t.netReady=true;updateHUD();
    showTip('NETosis primed — click to fire!','Click the neutrophil again in NETosis mode to trigger the chromatin release immediately.');
  }
}
cv.addEventListener('click',e=>{
  if(!running||gameOver)return;
  const r=cv.getBoundingClientRect();
  const cx=(e.clientX-r.left)*(W/r.width),cy=(e.clientY-r.top)*(H/r.height);
  const hit=towers.find(t=>!t.dead&&Math.hypot(t.x-cx,t.y-cy)<20);
  if(mode==='place'){
    if(hit){showMsg('Switch to an upgrade mode to upgrade this neutrophil.');return;}
    if(cy<VY1+6||cy>VY2-6){showMsg('Place neutrophils inside the vessel!');return;}
    if(energy<PLACE_COST){showMsg(`Need ${PLACE_COST} ATP.`);return;}
    energy-=PLACE_COST;towers.push(mkNeutrophil(cx,cy));updateHUD();
  } else {if(hit)applyUpgrade(hit);else showMsg('Click a neutrophil to upgrade it!');}
});
cv.addEventListener('contextmenu',e=>{
  e.preventDefault();if(!running||gameOver)return;
  const r=cv.getBoundingClientRect();
  const cx=(e.clientX-r.left)*(W/r.width),cy=(e.clientY-r.top)*(H/r.height);
  const hit=towers.find(t=>!t.dead&&Math.hypot(t.x-cx,t.y-cy)<20);
  if(!hit){showMsg('Right-click a neutrophil to upgrade.');return;}
  if(mode==='place')setMode('degran');applyUpgrade(hit);
});

function setMode(m){
  mode=m;
  ['place','degran','net'].forEach(id=>{const sel=id==='net'?' sel-purple':id==='degran'?' sel-amber':' sel';document.getElementById('btn-'+id).className='tbtn'+(m===id?sel:'');});
  const hints={place:'Click vessel to place a neutrophil',degran:'Click neutrophil to add 3 granule charges (15 ATP)',net:'Click to prime NETosis (60 ATP), click again to trigger immediately'};
  document.getElementById('mode-hint').textContent=hints[m];
}

// ── HUD / messages ─────────────────────────────────────────────────
function updateHUD(){
  document.getElementById('e-val').textContent=Math.round(energy);
  document.getElementById('w-val').textContent=wave+1;
  document.getElementById('esc-val').textContent=escaped;
  document.getElementById('col-val').textContent=collateral;
  document.getElementById('net-val').textContent=nets.length;
  const pct=Math.max(0,tissueHP),f=document.getElementById('t-fill');
  f.style.width=pct+'%';f.style.background=pct>60?'#5DCAA5':pct>30?'#EF9F27':'#E24B4A';
}
let msgT=null;
function showMsg(txt){const el=document.getElementById('msg');el.textContent=txt;el.style.opacity=1;clearTimeout(msgT);msgT=setTimeout(()=>el.style.opacity=0,2600);}
let tipT=null;
function showTip(title,body){document.getElementById('tip-title').textContent=title;document.getElementById('tip-body').textContent=body;const el=document.getElementById('tip');el.style.opacity=1;clearTimeout(tipT);tipT=setTimeout(()=>el.style.opacity=0,5500);}
function spawnTxt(x,y,text,color){particles.push({type:'txt',x,y,text,color,life:38,maxLife:38});}
let flt=null;
function flashCollateral(){const el=document.getElementById('collateral-flash');el.style.opacity=1;clearTimeout(flt);flt=setTimeout(()=>el.style.opacity=0,130);}

// ── Screens ────────────────────────────────────────────────────────
function showBriefing(){document.getElementById('ov').style.display='none';document.getElementById('briefing').style.display='flex';}
function showReady(){
  document.getElementById('briefing').style.display='none';
  const ov=document.getElementById('ov');ov.style.display='flex';
  ov.querySelector('h2').textContent='Ready?';
  ov.querySelector('p').innerHTML='Watch the vessel walls scar permanently as damage accumulates. Prime NETosis then <strong>click the cell to fire at the right moment.</strong> Isolated NETs are manageable — overlapping ones compound damage fast.';
  ov.querySelector('button').textContent='Start Level 3';
  ov.querySelector('button').onclick=startGame;
}
function endGame(win,reason){
  gameOver=true;running=false;
  const ov=document.getElementById('ov');ov.style.display='flex';
  if(win){
    ov.querySelector('h2').textContent='Level 3 cleared!';
    const note=scars.length>15?`The vessel walls carry ${scars.length} permanent damage marks — scarring outlasts the infection.`:'Minimal scarring — excellent immune discipline.';
    ov.querySelector('p').textContent=`All waves cleared. Tissue health: ${Math.round(tissueHP)}%. Collateral: ${collateral} pts. ${note}`;
  } else {
    const r={nets:'Overlapping NETs caused runaway immunothrombosis — clotting killed the patient.',wall:'Repeated wall-blasts caused fatal scarring and plasma leakage.',escape:'Too many pathogens reached the tissue.'};
    ov.querySelector('h2').textContent='Host failure';
    ov.querySelector('p').textContent=(r[reason]||r.escape)+' The immune response itself became the cause of death — the definition of immunopathology.';
  }
  ov.querySelector('button').textContent='Play again';ov.querySelector('button').onclick=reset;
}
function reset(){
  towers=[];enemies=[];torpedoes=[];particles=[];leaks=[];nets=[];scars=[];
  energy=100;tissueHP=100;collateral=0;wave=0;escaped=0;netTissueTick=0;netHyphTick=0;
  waveTimer=0;spawnedB=0;spawnedH=0;wc=WAVE_CFG[0];
  gameOver=false;running=false;setMode('place');updateHUD();
  const ov=document.getElementById('ov');ov.style.display='flex';
  ov.querySelector('h2').textContent='Level 3 — NETosis';
  ov.querySelector('p').innerHTML='Neutrophils hunt by <strong>chemotaxis</strong>. Upgrade with NETosis (60 ATP) then <strong>click to fire immediately</strong>. Chromatin strands trap bacteria and grind hyphae. Damage scars the vessel permanently — stacking NETs accelerates this.';
  ov.querySelector('button').textContent='See briefing';ov.querySelector('button').onclick=showBriefing;
}
function startGame(){
  document.getElementById('ov').style.display='none';
  running=true;updateHUD();
  showMsg('Neutrophils hunt bacteria — prime NETosis then click to trigger!');
  requestAnimationFrame(loop);
}
document.getElementById('start-btn').onclick=showBriefing;
updateHUD();
