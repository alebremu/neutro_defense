/**
 * draw.js
 * Pure rendering functions — no game state mutation here.
 * Each function receives the canvas 2d context (ctx) plus relevant data.
 */

// ── Vessel & background ────────────────────────────────────────────

function drawVessel(ctx) {
  // Interior fill
  ctx.fillStyle = 'rgba(253,232,221,0.55)';
  ctx.fillRect(0, VY1, W, VY2 - VY1);

  // Wall lines
  ctx.strokeStyle = '#F0997B';
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = 0.38;
  ctx.beginPath(); ctx.moveTo(0, VY1); ctx.lineTo(W, VY1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, VY2); ctx.lineTo(W, VY2); ctx.stroke();
  ctx.globalAlpha = 1;

  // Flow arrows
  ctx.strokeStyle = '#F0997B';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.18;
  for (let x = 60; x < W; x += 90) {
    ctx.beginPath(); ctx.moveTo(x, VCY); ctx.lineTo(x + 26, VCY); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 21, VCY - 4);
    ctx.lineTo(x + 27, VCY);
    ctx.lineTo(x + 21, VCY + 4);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Labels
  ctx.save();
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(180,90,40,0.5)';
  ctx.fillText('blood vessel →', 8, VY1 - 5);
  ctx.fillText('tissue', 8, VY1 - 18);
  ctx.fillText('tissue', 8, VY2 + 26);
  ctx.restore();

  drawTissueCells(ctx);
}

function drawTissueCells(ctx) {
  ctx.save();
  ctx.globalAlpha = 0.10;
  const positions = [
    [80, 70], [200, 88], [370, 55], [500, 82], [650, 70], [740, 88],
    [100, 295], [260, 308], [420, 298], [580, 288], [720, 303],
  ];
  positions.forEach(([cx, cy]) => {
    ctx.fillStyle = '#F0997B';
    ctx.beginPath(); ctx.ellipse(cx, cy, 26, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#D85A30';
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F0997B';
  });
  ctx.restore();
}

// ── Neutrophil tower ───────────────────────────────────────────────

function drawNeutrophil(ctx, t) {
  ctx.save();

  // Velocity tail — shows direction of movement
  const spd = Math.hypot(t.vx || 0, t.vy || 0);
  if (spd > 0.15) {
    const nx = t.vx / spd, ny = t.vy / spd;
    ctx.beginPath();
    ctx.moveTo(t.x - nx * 10, t.y - ny * 10);
    ctx.lineTo(t.x - nx * 18, t.y - ny * 18);
    ctx.strokeStyle = 'rgba(29,158,117,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Range ring on hover
  if (t.hovered) {
    ctx.beginPath(); ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2);
    ctx.strokeStyle = '#1D9E75';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.15;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Digest progress arc (orange, counts down)
  if (t.load > 0) {
    const frac = t.digestTimer / DIGEST_TIME;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.strokeStyle = '#EF9F27';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Engulf flash glow
  if (t.flashT > 0) {
    ctx.beginPath(); ctx.arc(t.x, t.y, 22, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(93,202,165,${(t.flashT / 10) * 0.35})`;
    ctx.fill();
    t.flashT--;
  }

  // Cell body — amber when full, teal when available
  const full = t.load >= MAX_LOAD;
  ctx.beginPath(); ctx.arc(t.x, t.y, 15, 0, Math.PI * 2);
  ctx.fillStyle   = full ? '#FAC775' : '#5DCAA5';
  ctx.strokeStyle = full ? '#BA7517' : '#1D9E75';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  // Multi-lobed nucleus (polymorphonuclear appearance)
  ctx.fillStyle = full ? 'rgba(133,79,11,0.5)' : 'rgba(15,110,86,0.5)';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(
      t.x + Math.cos(i * 2.09) * 5,
      t.y + Math.sin(i * 2.09) * 3.5,
      3.5, 0, Math.PI * 2
    );
    ctx.fill();
  }

  // Load indicator dots (red = bacteria inside)
  for (let i = 0; i < t.load; i++) {
    ctx.beginPath();
    ctx.arc(t.x - 5 + i * 10, t.y + 18, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#E24B4A';
    ctx.fill();
  }

  ctx.restore();
}

// ── Bacterium ──────────────────────────────────────────────────────

function drawBacterium(ctx, b) {
  if (b.dead) return;
  ctx.save();
  ctx.translate(b.x, b.y);

  // Flagella wiggle
  const wag = Math.sin(Date.now() / 120 + b.phase) * 3.5;
  ctx.strokeStyle = '#F09595';
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.moveTo(-11, 0);
  ctx.quadraticCurveTo(-18, wag, -24, wag * 0.4);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Body — darker for encapsulated (hp > 1) bacteria
  const tough = b.maxHp > 1;
  ctx.fillStyle   = tough ? '#A32D2D' : '#E24B4A';
  ctx.strokeStyle = tough ? '#701010' : '#A32D2D';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, 0, 11, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // HP pip for encapsulated bacteria
  if (tough) {
    ctx.fillStyle = b.hp > 1 ? '#FF8080' : '#FFE0E0';
    ctx.beginPath(); ctx.arc(0, -12, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#A32D2D'; ctx.lineWidth = 1; ctx.stroke();
  }

  // Shine
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.ellipse(-3, -2, 4, 2.5, -0.4, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

// ── Particles ──────────────────────────────────────────────────────

function drawParticle(ctx, p) {
  ctx.save();

  if (p.type === 'engulf') {
    const f = p.life / p.maxLife;
    ctx.globalAlpha = f * 0.65;
    ctx.strokeStyle = '#5DCAA5';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 14 * (1 - f) + 4, 0, Math.PI * 2); ctx.stroke();

  } else if (p.type === 'pop') {
    const f = 1 - p.life / p.maxLife;
    ctx.globalAlpha = (1 - f) * 0.6;
    ctx.fillStyle = '#5DCAA5';
    ctx.beginPath();
    ctx.arc(p.x + p.vx * f * 16, p.y + p.vy * f * 16, 2.5, 0, Math.PI * 2);
    ctx.fill();

  } else if (p.type === 'txt') {
    ctx.globalAlpha = (p.life / p.maxLife) * 0.85;
    ctx.font = '500 12px system-ui, sans-serif';
    ctx.fillStyle = p.color || '#1D9E75';
    ctx.fillText(p.text, p.x, p.y - (p.maxLife - p.life) * 0.65);
  }

  p.life--;
  ctx.restore();
}

// ── Placement preview ──────────────────────────────────────────────

function drawPlacementPreview(ctx, mx, my) {
  if (my <= VY1 + 6 || my >= VY2 - 6) return;
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.beginPath(); ctx.arc(mx, my, 15, 0, Math.PI * 2);
  ctx.fillStyle = '#5DCAA5'; ctx.fill();
  ctx.strokeStyle = '#1D9E75'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(mx, my, PHAGO_RANGE, 0, Math.PI * 2);
  ctx.strokeStyle = '#1D9E75'; ctx.lineWidth = 1; ctx.globalAlpha = 0.12; ctx.stroke();
  ctx.restore();
}
