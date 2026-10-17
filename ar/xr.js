// GMC LED · kendi WebXR AR'ımız (Android Chrome): dokunduğun köşeye 1:1 oturur, tam çözünürlük, kamera içinde kontroller.
// Durum (ürün/ışık/stil) index.html'deki window.AR'dan okunur; sayfa değişince 'ar-degisti' olayı gelir.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const A = window.AR;
const ui = document.getElementById('xr-ui'), ipucuEl = document.getElementById('xr-ipucu');
const loader = new GLTFLoader();
const draco = new DRACOLoader(); draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/'); loader.setDRACOLoader(draco);
const SIYAH = new THREE.Color(0, 0, 0);
const ORJ = new Map();
let renderer, scene, camera, kok, model, reticle, hitSrc = null, oturum = null;
let yerlesti = false, kose1 = null, yukleniyor = null;

const ipucu = t => { ipucuEl.textContent = t; };

function kur() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio); renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.1;   // nötr: altın sarısı doygun kalır
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'none'; document.body.appendChild(renderer.domElement);
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .01, 60);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, .5));
  new RGBELoader().load('ortam.hdr', t => { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(t).texture; t.dispose(); pm.dispose(); });

  kok = new THREE.Group(); kok.visible = false; scene.add(kok);               // kök = vitrinin sol-ön-alt köşesi
  const gunes = new THREE.DirectionalLight(0xffffff, 1.1); gunes.position.set(2.2, 4, 1.6); gunes.target.position.set(1.24, 0, -.36);
  gunes.castShadow = true; gunes.shadow.mapSize.set(2048, 2048); gunes.shadow.radius = 5; gunes.shadow.bias = -.0005;
  Object.assign(gunes.shadow.camera, { left: -2.2, right: 2.2, top: 2.2, bottom: -2.2, near: .5, far: 9 });
  kok.add(gunes, gunes.target);
  const golge = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: .38 }));
  golge.position.set(1.24, .002, -.36); golge.receiveShadow = true; kok.add(golge);     // gerçek zemine temas gölgesi

  const halka = new THREE.Mesh(new THREE.RingGeometry(.07, .09, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8c46a }));
  const L1 = new THREE.Mesh(new THREE.BoxGeometry(.35, .006, .02), new THREE.MeshBasicMaterial({ color: 0xe8c46a })); L1.position.set(.175, 0, 0);
  const L2 = new THREE.Mesh(new THREE.BoxGeometry(.02, .006, .35), new THREE.MeshBasicMaterial({ color: 0xe8c46a })); L2.position.set(0, 0, -.175);
  reticle = new THREE.Group(); reticle.add(halka, L1, L2); reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle);
  renderer.setAnimationLoop(kare);
}

async function modelYukle() {
  const dosya = A.dosya(); yukleniyor = dosya;
  const g = await loader.loadAsync(dosya);
  if (yukleniyor !== dosya) return;                                            // bu arada başka ürün seçildi
  if (model) kok.remove(model);
  model = g.scene; ORJ.clear();
  model.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material, n = A.adi(m), efekt = n.startsWith('ar_');
    o.castShadow = !efekt && !n.startsWith('cam') && !n.startsWith('hayalet'); o.receiveShadow = !efekt;
    if (m.transparent) m.depthWrite = false;
    if (!ORJ.has(m)) ORJ.set(m, { renk: m.color.clone(), op: m.opacity, em: m.emissive.clone(), met: m.metalness, rou: m.roughness });
  });
  kok.add(model); uygula();
}

function uygula() {
  if (!renderer) return;
  const D = A.D, stil = A.STIL[D.stil].m || {};
  for (const [m, o] of ORJ) {
    const n = A.adi(m);
    if (n === 'ar_huzme' || n === 'ar_havuz') { m.opacity = D.isik ? o.op * (n === 'ar_huzme' ? .6 : 1) : 0; m.visible = D.isik; continue; }
    if (A.ISIKLI(n)) m.emissive.copy(D.isik ? o.em : SIYAH);
    if (A.ALTIN(n)) m.emissive.copy(o.em).multiplyScalar(D.isik ? 1 : .12);
    const s = stil[n];
    if (s) { m.color.setRGB(...s[0]); m.metalness = s[1]; m.roughness = s[2]; }
    else if (!A.ISIKLI(n)) { m.color.copy(o.renk); m.metalness = o.met; m.roughness = o.rou; }
  }
  renderer.toneMappingExposure = D.isik ? 1.1 : .7;
  uiGuncelle();
}

function dokun() {
  if (!reticle.visible) return;
  const p = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
  if (!yerlesti) {                                                             // 1. dokunuş: sol-ön alt köşe; ön yüz kameraya bakar
    const c = new THREE.Vector3().setFromMatrixPosition(renderer.xr.getCamera().matrixWorld);
    kok.position.copy(p); kok.rotation.set(0, Math.atan2(c.x - p.x, c.z - p.z), 0); kok.visible = true;
    yerlesti = true; kose1 = p.clone();
    ipucu('Oturdu. Yönü düzeltmek için SAĞ-ÖN köşeye nişan alıp dokun — ya da böyle bırak.');
  } else if (kose1) {                                                          // 2. dokunuş: sağ-ön köşe → ön kenar bu çizgiye hizalanır
    const d = p.clone().sub(kose1);
    if (d.length() > .3) kok.rotation.set(0, Math.atan2(-d.z, d.x), 0);
    kose1 = null; ipucu('Hizalandı. Işığı aç-kapat, ürünü ve stili değiştir.');
  }
}

function kare(t, frame) {
  if (frame && hitSrc) {
    const r = frame.getHitTestResults(hitSrc);
    const arar = !yerlesti || kose1;
    if (r.length && arar) {
      reticle.matrix.fromArray(r[0].getPose(renderer.xr.getReferenceSpace()).transform.matrix); reticle.visible = true;
      if (!yerlesti) ipucu('Vitrinin SOL-ÖN alt köşesine nişan al ve dokun.');
    } else {
      reticle.visible = false;
      if (!yerlesti) ipucu('Telefonu yere doğrult, yavaşça sağa sola gezdir…');
    }
  }
  renderer.render(scene, camera);
}

export async function baslat() {
  if (!renderer) kur();
  oturum = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: ui } });
  let olcek = 1; try { olcek = Math.min(2, XRWebGLLayer.getNativeFramebufferScaleFactor(oturum)) || 1; } catch (_) {}
  renderer.xr.setFramebufferScaleFactor(Math.max(1, olcek));                  // ekranın kendi çözünürlüğü: bulanıklık yok
  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(oturum);
  ui.style.display = 'flex'; kok.visible = false; yerlesti = false; kose1 = null;
  hitSrc = await oturum.requestHitTestSource({ space: await oturum.requestReferenceSpace('viewer') });
  oturum.addEventListener('select', dokun);
  oturum.addEventListener('end', () => { ui.style.display = 'none'; hitSrc = null; oturum = null; });
  ipucu('Telefonu yere doğrult, yavaşça sağa sola gezdir…');
  await modelYukle();
}

// ---- kamera içi kontroller (sayfadaki düğmelere vekâlet eder; durum tek yerde) ----
function uiGuncelle() {
  const D = A.D;
  ui.querySelector('[data-x=isik]').classList.toggle('acik', D.isik);
  ui.querySelector('[data-x=isik] span').textContent = D.isik ? 'Işık açık' : 'Işık kapalı';
  ui.querySelectorAll('[data-os]').forEach(b => b.classList.toggle('aktif', (b.dataset.os === 'once') === D.once));
  ui.querySelectorAll('[data-urun]').forEach(b => b.classList.toggle('aktif', !D.once && b.dataset.urun === D.urun));
  ui.querySelectorAll('[data-stil]').forEach(b => b.classList.toggle('aktif', b.dataset.stil === D.stil));
}
ui.querySelectorAll('.xr-kontrol').forEach(k => k.addEventListener('beforexrselect', e => e.preventDefault()));   // düğmeye basmak vitrini taşımasın
ui.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const x = b.dataset;
  if (x.x === 'isik') document.getElementById('isik').click();
  else if (x.os) document.querySelector(`#oncesonra button[data-v=${x.os}]`).click();
  else if (x.urun) document.querySelector(`#urunler button[data-v=${x.urun}]`).click();
  else if (x.stil) document.querySelector(`#stiller button[data-v=${x.stil}]`).click();
  else if (x.x === 'don-sol') kok.rotateY(THREE.MathUtils.degToRad(2));
  else if (x.x === 'don-sag') kok.rotateY(THREE.MathUtils.degToRad(-2));
  else if (x.x === 'yeniden') { yerlesti = false; kose1 = null; kok.visible = false; }
  else if (x.x === 'kapat' && oturum) oturum.end();
});
window.addEventListener('ar-degisti', e => { if (!oturum) return; if (e.detail === 'model') modelYukle(); else uygula(); });
