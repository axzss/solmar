// SOLMAR v4 — HUD DOM + rotating minimap canvas (district-tinted sectors,
// GPS route polyline, blips) + radio widget + district popup + damage flash.
export class HUD {
  constructor() {
    this.el = {};
    for (const id of ['missionTitle', 'objective', 'timer', 'stars', 'money', 'clock', 'packages',
      'healthFill', 'armorFill', 'weapon', 'speed', 'radio', 'radioBars', 'district', 'toast',
      'minimap', 'damage', 'center', 'startScreen', 'pauseScreen', 'endScreen', 'bustedScreen']) {
      this.el[id] = document.getElementById(id);
    }
    this.mm = this.el.minimap.getContext('2d');
    this.district = '';
    this.districtTimer = 0;
    this.radioLevel = 0;
  }
  toast(text, ms = 2600) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { this.el.toast.style.opacity = '0'; }, ms);
  }
  showDistrict(name) {
    if (name === this.district) return;
    this.district = name;
    this.el.district.textContent = name;
    this.el.district.style.opacity = '1';
    this.districtTimer = 2.4;
  }
  update(dt, s) {
    // s: {missionTitle, objective, timer, wanted, money, clockLabel, packages,
    // health, armor, weaponLabel, speedMph, radioOn, station, inVehicle}
    this.el.missionTitle.textContent = s.missionTitle;
    this.el.objective.textContent = s.objective;
    this.el.timer.textContent = s.timer > 0 ? `⏱ ${Math.ceil(s.timer)}s` : '';
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < s.wanted ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.style.color = s.wanted >= 4 ? '#ff4040' : s.wanted > 0 ? '#ffb020' : '#888888';
    this.el.money.textContent = `$${Math.floor(s.money)}`;
    this.el.clock.textContent = `${s.clockLabel} ${s.clock}`;
    this.el.packages.textContent = `📦 ${s.packages}/10`;
    this.el.healthFill.style.width = `${Math.max(0, s.health)}%`;
    this.el.armorFill.style.width = `${Math.max(0, s.armor)}%`;
    this.el.weapon.textContent = s.weaponLabel;
    this.el.speed.textContent = s.inVehicle ? `${Math.round(s.speedMph)} mph` : '0 mph';
    this.el.radio.textContent = `♪ ${s.station} — ${s.radioOn ? 'ON' : 'OFF'} (M)`;
    // radio waveform bars
    this.radioLevel = this.radioLevel * 0.85 + (s.radioOn ? Math.random() * 0.9 + 0.1 : 0) * 0.15;
    let bars = '';
    for (let i = 0; i < 12; i++) {
      const h = Math.max(2, Math.round(this.radioLevel * (6 + ((i * 7) % 9)) * (0.5 + Math.random() * 0.5)));
      bars += `<span style="height:${h}px"></span>`;
    }
    this.el.radioBars.innerHTML = bars;
    if (this.districtTimer > 0) {
      this.districtTimer -= dt;
      if (this.districtTimer <= 0) this.el.district.style.opacity = '0';
    }
  }
  damageFlash(amount) {
    this.el.damage.style.opacity = String(Math.min(0.85, 0.25 + amount / 60));
    setTimeout(() => { this.el.damage.style.opacity = '0'; }, 260);
  }
  // Rotating minimap: north-up sectors tinted by district, GPS polyline, blips.
  drawMinimap(s) {
    // s: {playerX, playerZ, heading, route[], cops[], cars[], heli, boats[], target, traffic[], peds[], packages[]}
    const ctx = this.mm, W = 168, H = 168, R = W / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R - 2, 0, Math.PI * 2); ctx.clip();
    const scale = W / 340; // world 340m across the disc
    const toMap = (x, z) => {
      // rotate world so player heading is up
      const dx = (x - s.playerX) * scale, dz = (z - s.playerZ) * scale;
      const c = Math.cos(-s.heading), si = Math.sin(-s.heading);
      return [R + dx * c - dz * si, R + dx * si + dz * c];
    };
    // district sectors (static tint blocks in world space, rotated with map)
    ctx.fillStyle = '#1c2a4a'; ctx.fillRect(0, 0, W, H);
    const sectors = [
      { x: 0, z: -160, w: 160, h: 140, c: '#24365e' }, // downtown
      { x: -160, z: -160, w: 90, h: 90, c: '#1d3a24' }, // hill
      { x: -160, z: -70, w: 90, h: 230, c: '#3a2f22' }, // old town
      { x: 70, z: -160, w: 90, h: 230, c: '#2e2a24' }, // port
      { x: -160, z: 70, w: 320, h: 90, c: '#0e3a4a' }, // marina
    ];
    for (const sec of sectors) {
      const [x1, y1] = toMap(sec.x, sec.z);
      const [x2, y2] = toMap(sec.x + sec.w, sec.z + sec.h);
      ctx.fillStyle = sec.c;
      ctx.save(); ctx.translate(R, R); ctx.rotate(0); ctx.restore();
      // approximate: draw as rotated rect via transform
      ctx.save();
      ctx.translate(R, R); ctx.rotate(-s.heading);
      ctx.fillRect((sec.x - s.playerX) * scale, (sec.z - s.playerZ) * scale, sec.w * scale, sec.h * scale);
      ctx.restore();
      void x1; void y1; void x2; void y2;
    }
    // water south + east
    ctx.save(); ctx.translate(R, R); ctx.rotate(-s.heading);
    ctx.fillStyle = '#0a4a62';
    ctx.fillRect((-160 - s.playerX) * scale, (160 - s.playerZ) * scale, 320 * scale, 90 * scale);
    ctx.fillRect((160 - s.playerX) * scale, (-160 - s.playerZ) * scale, 90 * scale, 320 * scale);
    // roads grid
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 16; i++) {
      const c = -160 + i * 20;
      ctx.beginPath(); ctx.moveTo((c - s.playerX) * scale, (-160 - s.playerZ) * scale); ctx.lineTo((c - s.playerX) * scale, (160 - s.playerZ) * scale); ctx.stroke();
      ctx.beginPath(); ctx.moveTo((-160 - s.playerX) * scale, (c - s.playerZ) * scale); ctx.lineTo((160 - s.playerX) * scale, (c - s.playerZ) * scale); ctx.stroke();
    }
    ctx.restore();
    // GPS route (yellow polyline)
    if (s.route && s.route.length > 1) {
      ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 3; ctx.beginPath();
      s.route.forEach((p, i) => {
        const [x, y] = toMap(p.x, p.z);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    const dot = (x, z, color, r = 3) => {
      const [mx, my] = toMap(x, z);
      if (Math.hypot(mx - R, my - R) > R - 4) return;
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
    };
    for (const t of s.traffic || []) dot(t.x, t.z, '#ffffff', 2);
    for (const p of s.packages || []) dot(p.x, p.z, '#9dff6a', 2.5);
    if (s.target) dot(s.target.x, s.target.z, '#ffd76a', 5);
    for (const c of s.cops || []) dot(c.x, c.z, '#ff4040', 3);
    for (const c of s.cars || []) dot(c.x, c.z, '#3a6aff', 3);
    for (const b of s.boats || []) dot(b.x, b.z, '#54e0ff', 3);
    if (s.heli) {
      const [hx, hy] = toMap(s.heli.x, s.heli.z);
      ctx.fillStyle = '#ff4040'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
      ctx.fillText('H', hx, hy + 4);
    }
    // player arrow (centre, pointing up)
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath(); ctx.moveTo(R, R - 9); ctx.lineTo(R - 6, R + 7); ctx.lineTo(R + 6, R + 7); ctx.closePath(); ctx.fill();
    ctx.restore();
    // ring + N
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(R, R, R - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center';
    ctx.fillText('N', R, 13);
  }
  show(id) { this.el[id].style.display = 'flex'; }
  hide(id) { this.el[id].style.display = 'none'; }
  setCenter(html) { this.el.center.innerHTML = html; }
}
