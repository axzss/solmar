// SOLMAR v4 — time-of-day presets + lighting rig (PMREM env, ACES, matched fog).
import * as THREE from 'three';

export const PRESETS = {
  dawn: {
    label: 'DAWN', clock: '06:40', sunColor: 0xffb36b, sunI: 2.6,
    sunPos: [90, 26, -40], hemiSky: 0x8fa8c8, hemiGround: 0x5a4a3a, hemiI: 0.55,
    skyTop: '#5d7ea6', skyMid: '#e8a06a', skyBot: '#f7c98a',
    fog: 0xc99a7a, fogDensity: 0.0011, exposure: 1.05, envI: 0.7, lampI: 1.6, neonI: 1.2,
  },
  noon: {
    label: 'NOON', clock: '12:30', sunColor: 0xfff2d8, sunI: 3.4,
    sunPos: [30, 120, 20], hemiSky: 0xbfd9ff, hemiGround: 0x8a7a5e, hemiI: 0.85,
    skyTop: '#2f7fd0', skyMid: '#7db8e8', skyBot: '#cfe8f5',
    fog: 0xa8c8de, fogDensity: 0.0009, exposure: 1.0, envI: 1.0, lampI: 0.0, neonI: 0.4,
  },
  'dusk-rain': {
    label: 'DUSK RAIN', clock: '18:20', sunColor: 0xff7a4d, sunI: 1.9,
    sunPos: [-80, 18, 60], hemiSky: 0x6a5a8a, hemiGround: 0x3a3230, hemiI: 0.5,
    skyTop: '#3a2f5e', skyMid: '#c65a3a', skyBot: '#e88a4a',
    fog: 0x5a4450, fogDensity: 0.0023, exposure: 1.02, envI: 0.65, lampI: 2.2, neonI: 1.8,
    rain: true,
  },
  night: {
    label: 'NIGHT', clock: '22:15', sunColor: 0x8aa8ff, sunI: 0.55,
    sunPos: [-40, 60, -80], hemiSky: 0x24355e, hemiGround: 0x0e0e14, hemiI: 0.35,
    skyTop: '#060a1e', skyMid: '#101c3e', skyBot: '#1c2a52',
    fog: 0x0a1226, fogDensity: 0.0012, exposure: 1.08, envI: 0.5, lampI: 2.6, neonI: 2.6,
  },
};

function skyCanvas(p) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, p.skyTop); g.addColorStop(0.55, p.skyMid); g.addColorStop(1, p.skyBot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
  // sun disk glow at the preset sun azimuth
  const sx = p.sunPos[0] > 0 ? 760 : 260, sy = p.sunPos[1] > 60 ? 90 : 210;
  const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 150);
  glow.addColorStop(0, 'rgba(255,244,214,0.95)');
  glow.addColorStop(0.25, 'rgba(255,200,120,0.5)');
  glow.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = '#fff6da'; ctx.beginPath(); ctx.arc(sx, sy, 22, 0, 7); ctx.fill();
  // faint stars at night
  if (p.label === 'NIGHT') {
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.6})`;
      ctx.fillRect(Math.random() * 1024, Math.random() * 220, 1.6, 1.6);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

export function createLighting(scene, renderer) {
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5e, 0.8);
  scene.add(hemi);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let current = 'noon';
  return {
    sun, hemi, pmrem,
    get current() { return current; },
    apply(name, focus = new THREE.Vector3(0, 0, 0)) {
      const p = PRESETS[name] || PRESETS.noon;
      current = name;
      sun.color.setHex(p.sunColor); sun.intensity = p.sunI;
      sun.position.set(p.sunPos[0] + focus.x, p.sunPos[1], p.sunPos[2] + focus.z);
      sun.target.position.copy(focus);
      hemi.color.setHex(p.hemiSky); hemi.groundColor.setHex(p.hemiGround);
      hemi.intensity = p.hemiI;
      scene.fog = new THREE.FogExp2(p.fog, p.fogDensity);
      scene.background = skyCanvas(p);
      renderer.toneMappingExposure = p.exposure;
      // PMREM env map from the same sky, once per preset — real reflections for
      // glass, wet asphalt, car paint and water at near-zero per-frame cost.
      const envScene = new THREE.Scene();
      const skyGeo = new THREE.SphereGeometry(50, 32, 16);
      const skyMat = new THREE.MeshBasicMaterial({ map: skyCanvas(p), side: THREE.BackSide });
      envScene.add(new THREE.Mesh(skyGeo, skyMat));
      const envTex = pmrem.fromScene(envScene, 0.04).texture;
      scene.environment = envTex;
      scene.environmentIntensity = p.envI;
      skyGeo.dispose(); skyMat.dispose();
      return p;
    },
  };
}
