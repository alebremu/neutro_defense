/**
 * game.js
 * Core game loop, input handling, state management, and HUD updates.
 * Depends on: constants.js, entities.js, draw.js
 */

// ── Canvas setup ───────────────────────────────────────────────────
const cv  = document.getElementById('gc');
const ctx = cv.getContext('2d');
cv.width  = W;
cv.height = H;

// ── Game state ─────────────────────────────────────────────────────
let towers    = [];
let bacteria  = [];
let particles = [];

let energy    = START_ATP;
let tissueHP  = TISSUE_START;
let wave      = 0;
let escaped   = 0;
let running   = false;
let gameOver  = false;
let waveTimer = 0;
let spawned   = 0;
let waveCfg   = WAVE_CFG[0];

let mx = 0;
let my = 0;

// ── Game loop ──────────────────────────────────────────────────────

function tick() {
  if (!running || gameOver) return;
  waveTimer++;

  // ── Spawn bacteria ──
  if (spawned < waveCfg.count && waveTimer % waveCfg.interval === 0) {
    bacteria.push(mkBact(waveCfg));
    spawned++;
  }

  // ── Move bacteria ──
  bacteria.forEach(b => {
    if (b.dead || b.engulfBy) return;
    b.x += b.speed;
    if (b.x > W + 10) {
      b.dead    = true;
      escaped  += 1;
      tissueHP  = Math.max(0, tissueHP - ESCAPE_DAMAGE);
      spawnTxt(W - 80, VCY - 10, `-${ESCAPE_DAMAGE} tissue`, '#E24B4A');
      updateHUD();
      if (tissueHP <= 0) endGame(false);
    }
  });

  // ── Move neutrophils (chemotaxis) + phagocytosis ──
  towers.forEach(t => {
    // Find nearest live bacterium within sensing radius
    let nearest = null, nearestD = ATTRACT_RADIUS;
    bacteria.forEach(b => {
      if (b.dead || b.engulfBy) return;
      const d = Math.hypot(b.x - t.x, b.y - t.y);
      if (d < nearestD) { nearestD = d; nearest = b; }
    });

    if (nearest) {
      // Steer toward bacterium
      const dx = nearest.x - t.x, dy = nearest.y - t.y;
      const d  = Math.hypot(dx, dy);
      t.vx = t.vx * 0.85 + (dx / d) * ATTRACT_SPEED * 0.15;
      t.vy = t.vy * 0.85 + (dy / d) * ATTRACT_SPEED * 0.15;
    } else {
      // Wander
      if (Math.random() < WANDER_CHANGE) t.wanderAngle += (Math.random() - 0.5) * 1.8;
      t.vx = t.vx * 0.9 + Math.cos(t.wanderAngle) * ROAM_SPEED * 0.1;
      t.vy = t.vy * 0.9 + Math.sin(t.wanderAngle) * ROAM_SPEED * 0.1;
    }

    t.x += t.vx; t.y += t.vy;

    // Clamp inside vessel
    if (t.y < VY1 + WALL_BUFFER) { t.y = VY1 + WALL_BUFFER; t.vy =  Math.abs(t.vy) * 0.5; t.wanderAngle =  Math.random() * Math.PI; }
    if (t.y > VY2 - WALL_BUFFER) { t.y = VY2 - WALL_BUFFER; t.vy = -Math.abs(t.vy) * 0.5; t.wanderAngle = -Math.random() * Math.PI; }
    if (t.x < 12)   { t.x = 12;   t.vx =  Math.abs(t.vx) * 0.5; }
    if (t.x > W-12) { t.x = W-12; t.vx = -Math.abs(t.vx) * 0.5; }

    // Digestion countdown
    if (t.load > 0) {
      t.digestTimer--;
      if (t.digestTimer <= 0) {
        const d   = t.load;
        t.load    = 0;
        t.digestTimer = 0;
        const reward  = d * DIGEST_REWARD;
        energy    = Math.min(999, energy + reward);
        spawnTxt(t.x, t.y - 26, `+${reward} ATP`, '#1D9E75');
        updateHUD();
        if (Math.random() < 0.3) showTip(TIPS.digest);
      }
    }

    // Try to phagocytose — only if not at max load
    if (t.load < MAX_LOAD) {
      for (const b of bacteria) {
        if (b.dead || b.engulfBy || t.load >= MAX_LOAD) continue;
        if (Math.hypot(b.x - t.x, b.y - t.y) < t.range) {
          b.hp--;
          t.flashT = 10;

          // Engulf animation particles
          particles.push({ type: 'engulf', x: b.x, y: b.y, life: 20, maxLife: 20 });
          for (let i = 0; i < 5; i++) {
            const a = Math.random() * Math.PI * 2;
            particles.push({
              type: 'pop', x: b.x, y: b.y,
              vx: Math.cos(a), vy: Math.sin(a),
              life: 18, maxLife: 18,
            });
          }

          if (b.hp <= 0) {
            b.engulfBy = t;
            b.engulfT  = 0;
            t.load++;
            if (t.digestTimer === 0) t.digestTimer = DIGEST_TIME;
          }

          if (Math.random() < 0.25) showTip(TIPS.phago);
          updateHUD();
          break; // one contact per neutrophil per tick
        }
      }
    }
  });

  // ── Pull engulfed bacteria toward their neutrophil ──
  bacteria.forEach(b => {
    if (!b.engulfBy || b.dead) return;
    b.x += (b.engulfBy.x - b.x) * 0.18;
    b.y += (b.engulfBy.y - b.y) * 0.18;
    if (++b.engulfT > 22) b.dead = true;
  });

  // ── Cleanup ──
  bacteria  = bacteria.filter(b => !b.dead);
  particles = particles.filter(p => p.life > 0);

  // ── Wave complete? ──
  if (spawned >= waveCfg.count && bacteria.length === 0) {
    if (wave >= 3) { endGame(true); return; }
    wave++;
    waveCfg   = WAVE_CFG[wave];
    spawned   = 0;
    waveTimer = 0;
    const bonus = WAVE_BONUS_BASE + wave * WAVE_BONUS_STEP;
    energy = Math.min(999, energy + bonus);
    updateHUD();

    const labels = [
      '', 'Wave 2 — faster and tighter!',
      'Wave 3 — dense swarm incoming!',
      'Wave 4 — hardened bacteria flood the vessel!',
    ];
    showMsg(`${labels[wave]} +${bonus} ATP`);

    const tipKeys = [null, 'wave2', 'wave3', 'wave4'];
    if (tipKeys[wave]) showTip(TIPS[tipKeys[wave]]);
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawVessel(ctx);
  towers.forEach(t    => drawNeutrophil(ctx, t));
  bacteria.forEach(b  => drawBacterium(ctx, b));
  particles.forEach(p => drawParticle(ctx, p));
  if (running && !gameOver) drawPlacementPreview(ctx, mx, my);
}

function loop() {
  tick();
  draw();
  if (!gameOver) requestAnimationFrame(loop);
}

// ── Particle helpers ───────────────────────────────────────────────

function spawnTxt(x, y, text, color) {
  particles.push({ type: 'txt', x, y, text, color, life: 36, maxLife: 36 });
}

// ── Input ──────────────────────────────────────────────────────────

cv.addEventListener('mousemove', e => {
  const r = cv.getBoundingClientRect();
  mx = (e.clientX - r.left) * (W / r.width);
  my = (e.clientY - r.top)  * (H / r.height);
  towers.forEach(t => { t.hovered = Math.hypot(t.x - mx, t.y - my) < 20; });
});

cv.addEventListener('mouseleave', () => {
  mx = 0; my = 0;
  towers.forEach(t => { t.hovered = false; });
});

cv.addEventListener('click', e => {
  if (!running || gameOver) return;
  const r  = cv.getBoundingClientRect();
  const cx = (e.clientX - r.left) * (W / r.width);
  const cy = (e.clientY - r.top)  * (H / r.height);

  if (cy < VY1 + 6 || cy > VY2 - 6) {
    showMsg('Place neutrophils inside the vessel!');
    return;
  }
  for (const t of towers) {
    if (Math.hypot(t.x - cx, t.y - cy) < 24) {
      showMsg('Already a neutrophil here!');
      return;
    }
  }
  if (energy < TOWER_COST) {
    showMsg(`Not enough ATP! Need ${TOWER_COST}.`);
    return;
  }

  energy -= TOWER_COST;
  towers.push(mkTower(cx, cy));
  updateHUD();
  if (Math.random() < 0.4) showTip(TIPS.place);
});

// ── HUD ────────────────────────────────────────────────────────────

function updateHUD() {
  document.getElementById('e-val').textContent   = Math.round(energy);
  document.getElementById('w-val').textContent   = wave + 1;
  document.getElementById('esc-val').textContent = escaped;

  const pct  = Math.max(0, tissueHP);
  const fill = document.getElementById('t-fill');
  fill.style.width      = pct + '%';
  fill.style.background = pct > 60 ? '#5DCAA5' : pct > 30 ? '#EF9F27' : '#E24B4A';
}

let msgTimeout = null;
function showMsg(txt) {
  const el = document.getElementById('msg');
  el.textContent  = txt;
  el.style.opacity = 1;
  clearTimeout(msgTimeout);
  msgTimeout = setTimeout(() => { el.style.opacity = 0; }, 2800);
}

let tipTimeout = null;
function showTip({ t, b }) {
  document.getElementById('tip-title').textContent = t;
  document.getElementById('tip-body').textContent  = b;
  const el = document.getElementById('tip');
  el.style.opacity = 1;
  clearTimeout(tipTimeout);
  tipTimeout = setTimeout(() => { el.style.opacity = 0; }, 5000);
}

// ── Game lifecycle ─────────────────────────────────────────────────

function startGame() {
  document.getElementById('ov').style.display = 'none';
  running  = true;
  updateHUD();
  showMsg('Click inside the vessel to place neutrophils — spend wisely!');
  requestAnimationFrame(loop);
}

function endGame(win) {
  gameOver = true;
  running  = false;
  const ov = document.getElementById('ov');
  ov.style.display = 'flex';

  if (win) {
    ov.querySelector('h2').textContent = 'Infection cleared!';
    ov.querySelector('p').textContent  =
      `All 4 waves stopped. Tissue health: ${Math.round(tissueHP)}%. ` +
      `Wave 4's encapsulated bacteria were brutal — level 2 introduces fungi that can't be phagocytosed at all…`;
  } else {
    ov.querySelector('h2').textContent = 'Tissue overwhelmed';
    ov.querySelector('p').textContent  =
      `Bacteria reached the tissue. In real infections this triggers sepsis. ` +
      `Try spacing neutrophils across the full vessel width early, before the waves accelerate!`;
  }

  const btn = ov.querySelector('button');
  btn.textContent = 'Play again';
  btn.onclick     = resetGame;
}

function resetGame() {
  towers    = [];
  bacteria  = [];
  particles = [];
  energy    = START_ATP;
  tissueHP  = TISSUE_START;
  wave      = 0;
  escaped   = 0;
  waveTimer = 0;
  spawned   = 0;
  waveCfg   = WAVE_CFG[0];
  gameOver  = false;
  running   = false;
  updateHUD();

  const ov  = document.getElementById('ov');
  ov.style.display = 'flex';
  ov.querySelector('h2').textContent = 'Neutrophil Defense';
  ov.querySelector('p').innerHTML    =
    'Place neutrophils <strong>inside the blood vessel</strong>. ' +
    'Each holds <strong>2 bacteria max</strong> before digesting. ' +
    'ATP is scarce — spend wisely and let digestion refund you!';
  const btn = ov.querySelector('button');
  btn.textContent = 'Start Level 1';
  btn.onclick     = startGame;
}

// ── Bootstrap ─────────────────────────────────────────────────────
updateHUD();
document.getElementById('start-btn').onclick = startGame;
