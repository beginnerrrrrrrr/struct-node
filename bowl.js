const BOWL_W = 90, BOWL_H = 90;
const bCanvas = document.getElementById('bowl-canvas');
const bCtx    = bCanvas.getContext('2d');

// Shared with app.js — app sets bowlTargetPct, bowl animates toward it
let bowlTargetPct  = 0;
let bowlCurrentPct = 0;
let waveT  = 0;
let ripples = []; // { x, y, r, maxR, alpha, speed }

/* ── Bowl shape path ── */
function drawBowlShape(ctx) {
  ctx.beginPath();
  ctx.moveTo(27, 9);
  ctx.bezierCurveTo(16, 9,  8, 18,  7, 32);
  ctx.bezierCurveTo( 6, 46, 9, 60, 16, 70);
  ctx.bezierCurveTo(21, 77, 32, 82, 45, 82);
  ctx.bezierCurveTo(58, 82, 69, 77, 74, 70);
  ctx.bezierCurveTo(81, 60, 84, 46, 83, 32);
  ctx.bezierCurveTo(82, 18, 74,  9, 63,  9);
  ctx.bezierCurveTo(56,  5, 34,  5, 27,  9);
  ctx.closePath();
}

/* ── Water vertical bounds ── */
function getWaterBounds(pct) {
  const fillTop = 10, fillBot = 80;
  const innerH  = fillBot - fillTop;
  const waterLevel = fillBot - innerH * (pct / 100);
  return { waterLevel, fillBot };
}

/* ── Public: called by HTML onclick ── */
function onBowlClick(e) {
  const rect = bCanvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (BOWL_W / rect.width);
  const my = (e.clientY - rect.top)  * (BOWL_H / rect.height);
  const { waterLevel } = getWaterBounds(bowlCurrentPct);
  if (my < waterLevel - 4 || bowlCurrentPct < 2) return;
  ripples.push({ x: mx, y: my, r: 1, maxR: 22 + Math.random() * 8, alpha: 0.7,  speed: 0.55 + Math.random() * 0.2 });
  setTimeout(() => ripples.push({ x: mx, y: my, r: 1, maxR: 12, alpha: 0.45, speed: 0.7 }), 80);
}

/* ── Main render loop ── */
function drawBowlFrame() {
  bCtx.clearRect(0, 0, BOWL_W, BOWL_H);

  // Ease water toward target
  const diff = bowlTargetPct - bowlCurrentPct;
  bowlCurrentPct += diff * 0.045;
  if (Math.abs(diff) < 0.05) bowlCurrentPct = bowlTargetPct;

  waveT += 0.025;
  const { waterLevel, fillBot } = getWaterBounds(bowlCurrentPct);

  // Clip everything inside the bowl shape
  bCtx.save();
  drawBowlShape(bCtx);
  bCtx.clip();

  if (bowlCurrentPct > 0.3) {
    // Water body gradient
    const wg = bCtx.createLinearGradient(0, waterLevel, 0, fillBot);
    wg.addColorStop(0,    '#4fc3f7');
    wg.addColorStop(0.35, '#0288d1');
    wg.addColorStop(1,    '#01579b');
    bCtx.fillStyle = wg;
    bCtx.fillRect(0, waterLevel, BOWL_W, fillBot - waterLevel + 4);

    // Animated wave surface
    bCtx.beginPath();
    for (let x = 0; x <= BOWL_W; x += 1.5) {
      const y = waterLevel
        + Math.sin((x * 0.13) + waveT)          * 2.4
        + Math.sin((x * 0.08) + waveT * 1.4)    * 1.5
        + Math.sin((x * 0.22) + waveT * 0.7)    * 0.8;
      x < 1 ? bCtx.moveTo(x, y) : bCtx.lineTo(x, y);
    }
    bCtx.lineTo(BOWL_W, fillBot + 4);
    bCtx.lineTo(0, fillBot + 4);
    bCtx.closePath();
    const sg = bCtx.createLinearGradient(0, waterLevel, 0, waterLevel + 18);
    sg.addColorStop(0, 'rgba(100,210,255,0.92)');
    sg.addColorStop(1, 'rgba(2,136,209,0.85)');
    bCtx.fillStyle = sg;
    bCtx.fill();

    // Wave crest highlight
    bCtx.beginPath();
    for (let x = 0; x <= BOWL_W; x += 1.5) {
      const y = waterLevel
        + Math.sin((x * 0.13) + waveT)        * 2.4
        + Math.sin((x * 0.08) + waveT * 1.4)  * 1.5
        + Math.sin((x * 0.22) + waveT * 0.7)  * 0.8 - 1;
      x < 1 ? bCtx.moveTo(x, y) : bCtx.lineTo(x, y);
    }
    bCtx.strokeStyle = 'rgba(180,240,255,0.3)';
    bCtx.lineWidth = 1.5;
    bCtx.stroke();

    // Ripples (perspective ellipses)
    ripples.forEach(rp => {
      bCtx.beginPath();
      bCtx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.32, 0, 0, Math.PI * 2);
      bCtx.strokeStyle = `rgba(180,240,255,${rp.alpha})`;
      bCtx.lineWidth = Math.max(0.3, 1.4 * (1 - rp.r / rp.maxR));
      bCtx.stroke();
    });

    // Bubbles drifting up
    for (let i = 0; i < 4; i++) {
      const bx = 16 + i * 18 + Math.sin(waveT * 0.6 + i * 1.7) * 3;
      const by = waterLevel + 8 + ((waveT * 9 + i * 17) % (fillBot - waterLevel - 8));
      bCtx.beginPath();
      bCtx.arc(bx, by, 1.2, 0, Math.PI * 2);
      bCtx.fillStyle = 'rgba(200,240,255,0.22)';
      bCtx.fill();
    }

    // Caustic shimmer
    const cl = bCtx.createLinearGradient(14, waterLevel, 36, waterLevel + 15);
    cl.addColorStop(0, 'rgba(255,255,255,0.12)');
    cl.addColorStop(1, 'rgba(255,255,255,0)');
    bCtx.fillStyle = cl;
    bCtx.beginPath();
    bCtx.ellipse(26, waterLevel + 8, 11, 4, 0.4, 0, Math.PI * 2);
    bCtx.fill();
  }

  bCtx.restore();

  // Glass shell (drawn on top of water)
  bCtx.save();
  drawBowlShape(bCtx);
  bCtx.fillStyle   = 'rgba(180,220,255,0.025)';
  bCtx.fill();
  bCtx.strokeStyle = 'rgba(255,255,255,0.18)';
  bCtx.lineWidth   = 1.4;
  bCtx.stroke();

  // Left sheen
  bCtx.beginPath();
  bCtx.moveTo(18, 20);
  bCtx.bezierCurveTo(12, 36, 15, 43, 15, 50);
  bCtx.strokeStyle = 'rgba(255,255,255,0.14)';
  bCtx.lineWidth = 2.5;
  bCtx.lineJoin  = 'round';
  bCtx.stroke();

  // Rim top highlight
  bCtx.beginPath();
  bCtx.moveTo(34, 6);
  bCtx.bezierCurveTo(45, 2, 54, 2, 58, 6);
  bCtx.strokeStyle = 'rgba(255,255,255,0.28)';
  bCtx.lineWidth = 1.2;
  bCtx.stroke();
  bCtx.restore();

  // Percentage text inside water
  if (bowlCurrentPct > 3) {
    const { waterLevel: wl, fillBot: fb } = getWaterBounds(bowlCurrentPct);
    const ty = Math.max(wl + (fb - wl) / 2 + 5, wl + 12);
    bCtx.save();
    bCtx.font          = 'bold 11px "Syne",sans-serif';
    bCtx.textAlign     = 'center';
    bCtx.textBaseline  = 'middle';
    bCtx.shadowColor   = 'rgba(0,0,0,0.6)';
    bCtx.shadowBlur    = 4;
    bCtx.fillStyle     = 'rgba(255,255,255,0.92)';
    bCtx.fillText(Math.round(bowlCurrentPct) + '%', BOWL_W / 2, Math.min(ty, fb - 8));
    bCtx.restore();
  }

  // Advance ripples
  ripples.forEach(rp => {
    rp.r    += (rp.maxR - rp.r) * rp.speed * 0.12;
    rp.alpha *= 0.955;
  });
  ripples = ripples.filter(rp => rp.alpha > 0.03 && rp.r < rp.maxR * 0.97);

  requestAnimationFrame(drawBowlFrame);
}

// Start the loop immediately
drawBowlFrame();
