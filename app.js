// ===== settings =====
// Google Analytics 4 measurement ID (G-XXXXXXXXXX). Empty = analytics off.
const GA_ID = 'G-CWMLT628SM';
// To manage data in Google Sheets later, publish the sheet as CSV and put that URL here.
const DATA_URL = 'data.csv';

// ===== analytics (GA4) =====
// Loaded from this file (not an inline snippet) so the page's CSP can forbid inline scripts.
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
if (GA_ID) {
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  gtag('js', new Date());
  gtag('config', GA_ID);
}
// Custom events, e.g. track('instagram_click', { shop_name }) → GA4 "Events" report
function track(name, params = {}) { if (GA_ID) gtag('event', name, params); }
const IMG = code => `img/${code}.jpg`;
const IG_POST = code => `https://www.instagram.com/p/${code}/`;
const CENTER = [35.7022, 139.7405];
const GENRES = ['ラーメン', '和食', '居酒屋', '焼き鳥', '焼肉', '中華', 'アジア・エスニック', 'カレー', 'イタリアン', 'フレンチ', '洋食・その他', 'バー'];

const TIERS = [
  { key: '5', label: '★5', color: 'var(--s5)', digit: 'light-digit' },
  { key: '4', label: '★4', color: 'var(--s4)', digit: 'light-digit' },
  { key: '3', label: '★3', color: 'var(--s3)', digit: 'dark-digit' },
  { key: '2', label: '★2', color: 'var(--s2)', digit: 'dark-digit' },
  { key: '1', label: '★1', color: 'var(--s1)', digit: 'dark-digit' },
  { key: '0', label: '★対象外', color: 'var(--s0)', digit: 'dark-digit' },
];
const NO_RATE_MARK = '−';
const tierOf = s => String(s.stars || 0);
const tierInfo = k => TIERS.find(t => t.key === k);
const mark = s => s.stars || NO_RATE_MARK;

// ===== CSV (handles quoted fields with newlines) =====
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = '';
    } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// ===== state =====
// Star filter: nothing picked = show everything; each tap adds/removes that tier (★5 then ★4 → ★4 or ★5).
const pickedTiers = new Set();
let genre = '';
let shops = [], selected = null, sortKey = 'stars', here = null, query = '';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const yen = n => n ? `〜${Number(n).toLocaleString('ja-JP')}円` : '';
const $ = id => document.getElementById(id);

// ===== map =====
const map = L.map('map', { zoomControl: false, zoomSnap: 0.5 }).setView(CENTER, 16);
// first view: both main stations (Kagurazaka west, Iidabashi east) on screen
function fitStations() {
  map.fitBounds([[35.70387, 139.73443], [35.70208, 139.74502]], {
    paddingTopLeft: [30, (document.getElementById('header')?.offsetHeight || 80) + 40], paddingBottomRight: [30, 90],
  });
}
// GSI (Geospatial Information Authority of Japan) pale map: Japanese labels, free with attribution
L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
  maxZoom: 19, maxNativeZoom: 18,
  attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>'
}).addTo(map);

// Stations as small landmarks (all styled the same). Drawn under the pins, not tappable.
const STATIONS = [
  ['飯田橋駅', 35.70208, 139.74502], ['神楽坂駅', 35.70387, 139.73443],
  ['牛込神楽坂駅', 35.70086, 139.73587], ['九段下駅', 35.69548, 139.75115],
  ['市ケ谷駅', 35.69101, 139.73557], ['水道橋駅', 35.70205, 139.7535],
  ['江戸川橋駅', 35.70973, 139.73298], ['後楽園駅', 35.70849, 139.75182],
];
const stationPane = map.createPane('stations');
stationPane.style.zIndex = 450; // above tiles/overlays, below markers (600)
stationPane.style.pointerEvents = 'none';
STATIONS.forEach(([name, lat, lng]) => L.marker([lat, lng], {
  pane: 'stations', interactive: false, keyboard: false,
  icon: L.divIcon({ className: 'station', html: `<span class="dot"></span><span class="lbl">${name}</span>`, iconSize: [0, 0] }),
}).addTo(map));

function pinIcon(s, isSel) {
  const t = tierInfo(tierOf(s));
  const size = s.stars >= 5 ? 30 : s.stars >= 4 ? 28 : 26;
  return L.divIcon({
    className: 'pin-wrap' + (isSel ? ' selected' : ''),
    html: `<div class="pin ${t.digit}" style="background:${t.color}">${mark(s)}</div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
}

// shrink pins step by step as the map zooms out so the dense Kagurazaka strip doesn't pile up
const PIN_SCALE = { 13: 0.28, 14: 0.35, 15: 0.45, 16: 0.6, 17: 0.8, 18: 1 };
function zoomClass() {
  const z = Math.round(map.getZoom()), el = map.getContainer();
  const ps = z >= 18 ? 1 : (PIN_SCALE[z] ?? 0.24);
  el.style.setProperty('--ps', ps);
  el.classList.toggle('digits-off', ps < 0.6);
  el.classList.toggle('very-far', z <= 13);
}
map.on('zoomend', zoomClass);
zoomClass();

function setHeaderOffset() {
  document.documentElement.style.setProperty('--header-h', $('header').offsetHeight + 'px');
  map.invalidateSize();
}

// ===== filters =====
function renderFilters() {
  const sel = $('genre');
  const opts = `<option value="">全ジャンル</option>` +
    GENRES.filter(g => shops.some(s => s.genre === g)).map(g => `<option value="${g}">${g}</option>`).join('');
  // header select and list select share one genre state
  const lsel = $('list-genre');
  sel.innerHTML = opts; lsel.innerHTML = opts;
  const setGenre = (v, fit) => {
    genre = v;
    [sel, lsel].forEach(x => { x.value = v; x.classList.toggle('on', !!v); });
    applyFilter();
    if (fit) fitVisible();
    track('filter_genre', { genre: v || 'all' });
  };
  sel.onchange = () => setGenre(sel.value, true);
  lsel.onchange = () => setGenre(lsel.value, true);
  const box = $('filters');
  box.insertAdjacentHTML('beforeend', TIERS.map(t =>
    `<button class="chip" data-k="${t.key}" aria-pressed="false"><span class="sw" style="background:${t.color}"></span>${t.label}</button>`).join(''));
  box.querySelectorAll('.chip').forEach(b => b.onclick = () => {
    const k = b.dataset.k;
    pickedTiers.has(k) ? pickedTiers.delete(k) : pickedTiers.add(k);
    applyFilter();
    track('filter_star', { tier: k, picked: pickedTiers.has(k) ? 1 : 0 });
  });
}

const passes = s => (!pickedTiers.size || pickedTiers.has(tierOf(s))) && (!genre || s.genre === genre);
const visible = () => shops.filter(passes);

function applyFilter() {
  shops.forEach(s => {
    const on = passes(s);
    if (on && !map.hasLayer(s.marker)) s.marker.addTo(map);
    if (!on && map.hasLayer(s.marker)) s.marker.remove();
  });
  $('filters').classList.toggle('has-pick', pickedTiers.size > 0);
  $('filters').querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', pickedTiers.has(b.dataset.k)));
  $('count').innerHTML = `<b>${visible().length}</b>軒/${shops.length}軒`;
  if (selected && !passes(selected)) hideSheet();
  if (list.classList.contains('open')) renderList();
}

// After a genre change, frame the matching pins. Far-away outliers (Azabu, Daikanyama...) are left out
// so the view stays on the neighbourhood.
function fitVisible() {
  const v = visible();
  if (!v.length) return;
  const near = v.filter(s => Math.hypot((s.lat - CENTER[0]) * 111, (s.lng - CENTER[1]) * 90.5) < 2.5);
  const pts = (near.length ? near : v).map(s => [s.lat, s.lng]);
  const top = $('header').offsetHeight + 16;
  map.flyToBounds(pts, { paddingTopLeft: [24, top], paddingBottomRight: [24, 90], maxZoom: 17, duration: 0.5 });
}

// ===== back button: sheet / list / lightbox each take one history entry =====
function pushLayer(name, extra = {}) {
  const st = history.state || {};
  if (st.layer === name) history.replaceState({ ...extra, layer: name }, '', extra.hash ?? location.hash);
  else history.pushState({ ...extra, layer: name }, '', extra.hash ?? location.hash);
}
function popLayer(name) {
  if ((history.state || {}).layer === name) history.back();
}
addEventListener('popstate', () => {
  const st = history.state || {};
  if (st.layer !== 'info') hideInfo();
  if (st.layer !== 'lightbox') hideLightbox();
  if (st.layer !== 'list' && st.layer !== 'lightbox') hideList();
  if (st.layer === 'sheet' || st.layer === 'lightbox') {
    const s = shops.find(x => x.code === st.code);
    if (s && selected !== s) showSheet(s, { pan: false });
  } else hideSheet();
  // back from a shop opened via the list → show the list again where it was
  if (st.layer === 'list' && !list.classList.contains('open')) reopenList();
});

// ===== detail sheet =====
const sheet = $('sheet');

function starHTML(n) {
  if (!n) return `<span class="norate">★対象外(ドリンク中心のお店)</span>`;
  return `<span class="stars" aria-label="星${n}つ">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
}

// ===== share: copy a link that opens this shop =====
// Instagram's paper-plane "share" glyph
const SHARE_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="3" x2="9.218" y2="10.083"/><polygon points="11.698 20.334 22 3.001 2 3.001 9.218 10.084 11.698 20.334"/></svg>';

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

async function copyShopLink(s) {
  const url = `${location.origin}${location.pathname}#${s.code}`;
  let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; } catch (e) { /* fall back below */ }
  if (!ok) { // older iOS / in-app browsers
    const ta = document.createElement('textarea');
    ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, url.length);
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
  }
  toast(ok ? 'リンクをコピーしました' : 'コピーできませんでした');
  if (ok) track('share_copy', { shop_name: s.name });
}

// via: 'pin' | 'list' | 'link' (shared #code URL) — lets GA show how people reach a shop
function trackShop(s, via) {
  track('shop_open', { shop_name: s.name, stars: s.stars || 0, genre: s.genre, via });
}

function openSheet(s, opts = {}) {
  showSheet(s, opts);
  trackShop(s, opts.via || 'pin');
  pushLayer('sheet', { code: s.code, hash: '#' + s.code });
}

function showSheet(s, { pan = true } = {}) {
  if (selected) { selected.marker.setIcon(pinIcon(selected, false)); selected.marker.setZIndexOffset(selected.z); }
  selected = s;
  s.marker.setIcon(pinIcon(s, true));
  s.marker.setZIndexOffset(10000);
  const gmap = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.name + ' ' + s.address)}`;
  sheet.innerHTML = `
    <div class="grab" id="grab"></div>
    <button class="photo" id="photo" aria-label="写真を拡大">
      <img src="${IMG(s.code)}" alt="${esc(s.name)} の写真" decoding="async">
      <span class="zoom">タップで拡大</span>
    </button>
    <div class="body">
      <div class="sheet-top">${starHTML(s.stars)}
        <span class="top-btns">
          <button class="share" id="sheet-share" aria-label="このお店のリンクをコピー">${SHARE_ICON}</button>
          <button class="close" id="sheet-close" aria-label="閉じる">✕</button>
        </span>
      </div>
      <h2 class="shop">${esc(s.name)}</h2>
      <div class="facts">
        ${s.bangai === '1' ? '<span class="tag">番外編</span>' : ''}<span>${esc(s.genre)}</span>
        ${s.price ? `<span><span class="k">予算</span>${yen(s.price)}${s.lunch === '1' ? '(ランチ)' : ''}</span>` : (s.lunch === '1' ? '<span>ランチ</span>' : '')}
      </div>
      ${s.comment ? `<p class="comment">${esc(s.comment)}</p>` : ''}
      <p class="addr">${esc(s.address)}</p>
      <div class="actions">
        <a class="btn primary" id="go-ig" href="${IG_POST(s.code)}" target="_blank" rel="noopener">投稿を見る</a>
        <a class="btn secondary" id="go-gmap" href="${gmap}" target="_blank" rel="noopener">Googleマップ</a>
      </div>
      <div class="posted">投稿日 ${s.date.replace(/-/g, '.')}</div>
    </div>`;
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  sheet.scrollTop = 0;
  $('sheet-close').onclick = closeSheet;
  $('sheet-share').onclick = () => copyShopLink(s);
  $('photo').onclick = () => { openLightbox(s); track('photo_zoom', { shop_name: s.name }); };
  $('go-ig').onclick = () => track('instagram_click', { shop_name: s.name, stars: s.stars || 0 });
  $('go-gmap').onclick = () => track('gmap_click', { shop_name: s.name });
  enableSwipeDown();
  if (pan) {
    // put the pin in the middle of the map strip left visible between header and sheet
    const z = Math.max(map.getZoom(), 17);
    const pt = map.project([s.lat, s.lng], z);
    if (innerWidth < 768) {
      const top = $('header').offsetHeight, bottom = innerHeight - sheet.offsetHeight;
      pt.y += innerHeight / 2 - (top + Math.max(bottom, top + 60)) / 2;
    }
    map.flyTo(map.unproject(pt, z), z, { duration: 0.4 });
  }
}

function hideSheet() {
  if (selected) { selected.marker.setIcon(pinIcon(selected, false)); selected.marker.setZIndexOffset(selected.z); }
  selected = null;
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
}
function closeSheet() {
  if ((history.state || {}).layer === 'sheet') history.back();
  else { hideSheet(); history.replaceState(null, '', location.pathname + location.search); }
}
map.on('click', () => { if (selected) closeSheet(); });

// swipe the sheet down (from the handle or the photo) to close it
function enableSwipeDown() {
  let y0 = null, dy = 0;
  const start = e => { if (sheet.scrollTop > 0) return; y0 = e.touches[0].clientY; dy = 0; sheet.classList.add('dragging'); };
  const move = e => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if (y0 == null) return;
    sheet.classList.remove('dragging');
    sheet.style.transform = '';
    if (dy > 90) closeSheet();
    y0 = null;
  };
  ['grab', 'photo'].forEach(id => {
    const el = $(id);
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', end);
  });
}

// ===== ⓘ star definitions =====
const infoPop = $('info-pop');
function openInfo() {
  infoPop.classList.add('open');
  infoPop.setAttribute('aria-hidden', 'false');
  pushLayer('info');
  track('info_open');
}
function hideInfo() { infoPop.classList.remove('open'); infoPop.setAttribute('aria-hidden', 'true'); }
$('btn-info').onclick = openInfo;
$('info-close').onclick = () => popLayer('info');
infoPop.onclick = e => { if (e.target === infoPop) popLayer('info'); }; // tap outside the card closes

// ===== photo lightbox =====
const lightbox = $('lightbox');
function openLightbox(s) {
  $('lightbox-img').src = IMG(s.code);
  $('lightbox-img').alt = s.name + ' の写真';
  lightbox.classList.add('open');
  pushLayer('lightbox', { code: s.code });
}
function hideLightbox() { lightbox.classList.remove('open'); }
lightbox.onclick = () => popLayer('lightbox');

// ===== list =====
const list = $('list');
function distM(s) {
  const p = here || CENTER;
  return Math.hypot((s.lat - p[0]) * 111000, (s.lng - p[1]) * 90500);
}
function renderList() {
  const q = query.trim().toLowerCase();
  let v = visible().filter(s => !q || s.name.toLowerCase().includes(q));
  if (sortKey === 'stars') v.sort((a, b) => (b.stars || 0) - (a.stars || 0) || b.date.localeCompare(a.date));
  if (sortKey === 'date') v.sort((a, b) => b.date.localeCompare(a.date));
  if (sortKey === 'near') v.sort((a, b) => distM(a) - distM(b));
  const ul = $('rows');
  if (!v.length) { ul.innerHTML = '<li class="empty">該当するお店がありません</li>'; return; }
  ul.innerHTML = v.map(s => {
    const t = tierInfo(tierOf(s));
    const d = sortKey === 'near' ? distM(s) : null;
    const dist = d == null ? '' : ` ・ ${d < 1000 ? Math.round(d / 10) * 10 + 'm' : (d / 1000).toFixed(1) + 'km'}`;
    return `<li><button class="row" data-code="${s.code}">
      <span class="thumb"><img src="${IMG(s.code)}" alt="" loading="lazy" decoding="async">
        <span class="pin ${t.digit}" style="background:${t.color}">${mark(s)}</span></span>
      <span class="nm">${s.bangai === '1' ? '<span class="tag">番外編</span>' : ''}${esc(s.name)}<span class="sub">${esc(s.genre)}${s.price ? ' ・ ' + yen(s.price) : ''}${dist}</span></span>
    </button></li>`;
  }).join('');
  // Opening a shop from the list: don't move the map; ✕ / back returns to the list at the same scroll spot
  ul.querySelectorAll('.row').forEach(b => b.onclick = () => {
    const s = shops.find(x => x.code === b.dataset.code);
    listScroll = $('rows-wrap').scrollTop;
    hideList();
    showSheet(s, { pan: false });
    trackShop(s, 'list');
    history.pushState({ layer: 'sheet', code: s.code, fromList: true }, '', '#' + s.code);
  });
}
let listScroll = 0;
function reopenList() {
  list.classList.add('open');
  list.setAttribute('aria-hidden', 'false');
  $('rows-wrap').scrollTop = listScroll;
}
function openList() { renderList(); list.classList.add('open'); list.setAttribute('aria-hidden', 'false'); pushLayer('list'); }
function hideList() { list.classList.remove('open'); list.setAttribute('aria-hidden', 'true'); }
$('btn-list').onclick = () => { openList(); track('list_open'); };
$('ig-icon').onclick = () => track('profile_click', { from: 'header_icon' });
$('ig-icon-list').onclick = () => track('profile_click', { from: 'list_icon' });
$('ig-note').onclick = () => track('profile_click', { from: 'map_note' });
$('list-close').onclick = () => popLayer('list');
$('btn-map').onclick = () => popLayer('list');
$('search').oninput = e => { query = e.target.value; renderList(); };
document.querySelectorAll('.sort .chip').forEach(b => b.onclick = () => {
  sortKey = b.dataset.sort;
  document.querySelectorAll('.sort .chip').forEach(x => x.setAttribute('aria-pressed', x === b));
  if (sortKey === 'near' && !here) locate(false);
  renderList();
});

// ===== geolocation =====
let hereMarker = null;
function locate(fly = true) {
  if (!navigator.geolocation) return;
  track('locate');
  navigator.geolocation.getCurrentPosition(p => {
    here = [p.coords.latitude, p.coords.longitude];
    if (!hereMarker) hereMarker = L.circleMarker(here, { radius: 9, color: '#FFFFFF', weight: 3, fillColor: '#00B7FF', fillOpacity: 1 }).addTo(map);
    else hereMarker.setLatLng(here);
    if (fly) map.flyTo(here, 17, { duration: 0.5 });
    if (list.classList.contains('open')) renderList();
  }, () => alert('現在地を取得できませんでした'), { enableHighAccuracy: true, timeout: 8000 });
}
$('btn-locate').onclick = () => locate(true);

// ===== boot =====
fetch(DATA_URL, { cache: 'no-cache' }).then(r => r.text()).then(text => {
  shops = parseCSV(text).map(r => ({
    ...r,
    stars: r.stars ? Number(r.stars) : 0,
    lat: Number(r.lat), lng: Number(r.lng),
  })).filter(s => s.lat && s.lng);
  shops.forEach(s => {
    s.z = (s.stars || 0) * 100; // higher stars draw on top
    s.marker = L.marker([s.lat, s.lng], { icon: pinIcon(s, false), zIndexOffset: s.z, keyboard: true, title: s.name })
      // tapping a pin never moves the map (only list picks / shared links fly to the shop)
      .on('click', e => { L.DomEvent.stopPropagation(e); openSheet(s, { pan: false }); });
  });
  renderFilters();
  applyFilter();
  setHeaderOffset();
  fitStations();
  // deep link: .../#<post code> opens that shop
  const hit = shops.find(s => s.code === location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  if (hit) openSheet(hit, { via: 'link' });
});
addEventListener('resize', setHeaderOffset);
setHeaderOffset();
