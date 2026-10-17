// ===== settings =====
// Google Analytics 4 measurement ID (G-XXXXXXXXXX). Empty = analytics off.
const GA_ID = 'G-CWMLT628SM';
// To manage data in Google Sheets later, publish the sheet as CSV and put that URL here.
const DATA_URL = 'data.csv';

// ===== analytics (GA4) =====
// Loaded from this file (not an inline snippet) so the page's CSP can forbid inline scripts.
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
// Owner / test devices opt out: open the site once with ?ga=off or #ga-off (undo with ?ga=on / #ga-on).
// ?ga= exists because Instagram's in-app browser mangles "#" in links.
let gaOff = false;
try {
  const gaParam = new URLSearchParams(location.search).get('ga');
  if (location.hash === '#ga-off' || gaParam === 'off') localStorage.setItem('ga_off', '1');
  if (location.hash === '#ga-on' || gaParam === 'on') localStorage.removeItem('ga_off');
  gaOff = localStorage.getItem('ga_off') === '1';
  if (gaParam) history.replaceState(null, '', location.pathname + location.hash);
} catch (e) { /* storage blocked: keep analytics on */ }
if (GA_ID && !gaOff) {
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  gtag('js', new Date());
  gtag('config', GA_ID);
}
// Custom events, e.g. track('instagram_click', { shop_name }) → GA4 "Events" report
function track(name, params = {}) { if (GA_ID && !gaOff) gtag('event', name, params); }
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

// JR Yamanote loop (OpenStreetMap relation 1972920, simplified ~8 m) so visitors who don't know the area
// can place Kagurazaka/Iidabashi inside central Tokyo. Faint line under the stations and pins.
const YAMANOTE = [[35.62865,139.73851],[35.62614,139.73874],[35.62506,139.7387],[35.61964,139.73726],[35.61854,139.7367],[35.618,139.73619],[35.61744,139.7354],[35.61713,139.73467],[35.61688,139.73358],[35.61684,139.73259],[35.61697,139.73173],[35.61726,139.73091],[35.61767,139.73025],[35.6187,139.72927],[35.62079,139.72761],[35.62693,139.72297],[35.62808,139.72144],[35.62979,139.71784],[35.63068,139.71685],[35.63183,139.71628],[35.63825,139.71465],[35.63942,139.71389],[35.64115,139.71309],[35.64717,139.70968],[35.65018,139.70815],[35.65151,139.70722],[35.65661,139.7026],[35.65802,139.70159],[35.65877,139.70126],[35.65984,139.70117],[35.66327,139.70147],[35.67022,139.70237],[35.67183,139.70272],[35.67505,139.70387],[35.67608,139.70397],[35.67844,139.70375],[35.68152,139.70292],[35.68324,139.70218],[35.68488,139.70174],[35.68805,139.70052],[35.68946,139.70016],[35.69062,139.69999],[35.6925,139.69997],[35.69518,139.69934],[35.6962,139.69936],[35.69858,139.69998],[35.70323,139.70044],[35.7042,139.70066],[35.71465,139.70433],[35.72121,139.70641],[35.73195,139.71185],[35.7331,139.71263],[35.73368,139.71328],[35.7342,139.71419],[35.7345,139.71527],[35.73465,139.71638],[35.73461,139.71732],[35.73112,139.7308],[35.73095,139.73202],[35.73105,139.73349],[35.73135,139.73456],[35.73359,139.73969],[35.73577,139.74524],[35.7376,139.74951],[35.74027,139.75483],[35.74047,139.75562],[35.74052,139.75656],[35.74027,139.75769],[35.7396,139.75908],[35.73514,139.76429],[35.73373,139.76559],[35.73117,139.76743],[35.72879,139.76955],[35.72709,139.77148],[35.7254,139.77389],[35.72061,139.77905],[35.72015,139.77942],[35.71953,139.77969],[35.71835,139.77972],[35.71735,139.7793],[35.71425,139.77662],[35.71142,139.7748],[35.71041,139.77469],[35.70843,139.77491],[35.70361,139.7741],[35.70146,139.77346],[35.69588,139.77269],[35.68564,139.76852],[35.68198,139.76689],[35.6774,139.76533],[35.6766,139.76492],[35.67602,139.76442],[35.67378,139.76155],[35.67298,139.76073],[35.67162,139.75985],[35.66856,139.7582],[35.66728,139.758],[35.66333,139.75858],[35.6613,139.75856],[35.65714,139.75763],[35.65281,139.75646],[35.65155,139.75599],[35.64985,139.75491],[35.64846,139.75328],[35.64501,139.74624],[35.644,139.74456],[35.64328,139.74385],[35.64218,139.74321],[35.6399,139.74256],[35.63066,139.73867],[35.62976,139.73848],[35.62865,139.73851]];
const railPane = map.createPane('rail');
railPane.style.zIndex = 350; // above tiles (200), below stations (450) and pins (600)
railPane.style.pointerEvents = 'none';
L.polyline(YAMANOTE, { pane: 'rail', interactive: false, color: '#80C241', opacity: 0.5, weight: 4, lineJoin: 'round' }).addTo(map);
// Major Yamanote stations: labels stay visible when zoomed out (the local station labels hide then)
const JY_STATIONS = [
  ['東京駅', 35.68124, 139.76661], ['秋葉原駅', 35.69836, 139.77306], ['上野駅', 35.71358, 139.77614],
  ['池袋駅', 35.73026, 139.71095], ['高田馬場駅', 35.7127, 139.70359], ['新宿駅', 35.68896, 139.70029],
  ['渋谷駅', 35.65802, 139.70159], ['品川駅', 35.62865, 139.73851],
];
JY_STATIONS.forEach(([name, lat, lng]) => L.marker([lat, lng], {
  pane: 'stations', interactive: false, keyboard: false,
  icon: L.divIcon({ className: 'station jy', html: `<span class="dot"></span><span class="lbl">${name}</span>`, iconSize: [0, 0] }),
}).addTo(map));
L.marker([35.73665, 139.74722], {
  pane: 'stations', interactive: false, keyboard: false,
  icon: L.divIcon({ className: 'jy-name', html: '<span>JR山手線</span>', iconSize: [0, 0] }),
}).addTo(map);

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
  if (list.classList.contains('open') || isDesk()) renderList();
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
  if (!n) return `<span class="norate">★対象外 (ドリンク中心のお店)</span>`;
  return `<span class="stars" aria-label="星${n}つ">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
}

// Instagram links are plain https + target="_blank". Tested on a phone 2026-10-14: Instagram's in-app
// browser never hands off to the app (instagram://, intent://, x-safari-https all fail), but a new-tab
// https link opens the post logged in, so likes work. Don't intercept these clicks.

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
        ${s.price ? `<span><span class="k">予算</span>${yen(s.price)}${s.lunch === '1' ? ' (ランチ)' : ''}</span>` : (s.lunch === '1' ? '<span>ランチ</span>' : '')}
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
  markActiveRow(s);
  if (pan === 'ifHidden') {
    // PC list click: the map is visible next to the list, so only slide it when the pin is off-screen
    const p = map.latLngToContainerPoint([s.lat, s.lng]), size = map.getSize();
    const top = $('header').offsetHeight + 24, right = size.x - (isDesk() ? 440 : 0) - 24;
    if (p.x < 24 || p.x > right || p.y < top || p.y > size.y - 24) {
      map.panBy([p.x - (24 + right) / 2, p.y - (top + size.y - 24) / 2], { duration: 0.4 });
    }
  } else if (pan) {
    // put the pin in the middle of the map strip left visible between header and sheet
    const z = Math.max(map.getZoom(), 17);
    const pt = map.project([s.lat, s.lng], z);
    if (innerWidth < 768) {
      const top = $('header').offsetHeight, bottom = innerHeight - sheet.offsetHeight;
      pt.y += innerHeight / 2 - (top + Math.max(bottom, top + 60)) / 2;
    }
    // shared links jump instantly (works even if the page was opened in a background tab)
    if (pan === 'instant') map.setView(map.unproject(pt, z), z, { animate: false });
    else map.flyTo(map.unproject(pt, z), z, { duration: 0.4 });
  }
}

function hideSheet() {
  if (selected) { selected.marker.setIcon(pinIcon(selected, false)); selected.marker.setZIndexOffset(selected.z); }
  selected = null;
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  markActiveRow(null);
}

// PC: the open shop is highlighted in the docked list
function markActiveRow(s) {
  document.querySelectorAll('#rows .row.active').forEach(r => r.classList.remove('active'));
  if (!s) return;
  const r = document.querySelector(`#rows .row[data-code="${s.code}"]`);
  if (r) { r.classList.add('active'); if (isDesk()) r.scrollIntoView({ block: 'nearest' }); }
}
function closeSheet() {
  if ((history.state || {}).layer === 'sheet') history.back();
  else { hideSheet(); history.replaceState(null, '', location.pathname + location.search); }
}
map.on('click', () => { if (selected) closeSheet(); });

// swipe the sheet down (from the handle or the photo) to close it
// Swipe down anywhere on the sheet to close it. If the sheet's content is scrolled, a downward
// drag scrolls it back first; only a pull that starts at the very top drags the sheet away.
(function swipeDownToClose() {
  let y0 = null, t0 = 0, dy = 0, dragging = false, startedAtTop = false;
  sheet.addEventListener('touchstart', e => {
    if (!sheet.classList.contains('open') || e.touches.length !== 1) return;
    y0 = e.touches[0].clientY; t0 = Date.now(); dy = 0; dragging = false;
    startedAtTop = sheet.scrollTop <= 0;
  }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (y0 == null) return;
    const d = e.touches[0].clientY - y0;
    if (!dragging) {
      if (startedAtTop && sheet.scrollTop <= 0 && d > 8) { dragging = true; sheet.classList.add('dragging'); }
      else { if (d < -8 || !startedAtTop) y0 = null; return; } // normal scroll
    }
    e.preventDefault(); // stop the page/sheet from scrolling while we drag
    dy = Math.max(0, d - 8);
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: false });
  const end = () => {
    if (y0 == null && !dragging) return;
    if (dragging) {
      const fast = dy > 40 && dy / Math.max(1, Date.now() - t0) > 0.5; // quick flick
      sheet.classList.remove('dragging');
      if (dy > 90 || fast) {
        // continue from where the finger let go and slide out quickly (no bounce back to the top first)
        sheet.style.transition = 'transform .16s ease-in';
        sheet.style.transform = `translateY(${sheet.offsetHeight + 20}px)`;
        setTimeout(() => {
          sheet.style.transition = 'none';
          hideSheet();
          sheet.style.transform = '';
          if ((history.state || {}).layer === 'sheet') history.back();
          else history.replaceState(null, '', location.pathname + location.search);
          requestAnimationFrame(() => requestAnimationFrame(() => { sheet.style.transition = ''; }));
        }, 160);
      } else {
        sheet.style.transform = ''; // not far enough: spring back
      }
    }
    y0 = null; dragging = false;
  };
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
})();

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
  ul.querySelectorAll('.row').forEach(b => {
    const s = shops.find(x => x.code === b.dataset.code);
    if (selected === s) b.classList.add('active');
    // PC: hovering a row lights up its pin on the map
    b.onmouseenter = () => s.marker.getElement()?.classList.add('hl');
    b.onmouseleave = () => s.marker.getElement()?.classList.remove('hl');
    b.onclick = () => openFromList(s);
  });
}
// Phone: don't move the map; ✕ / back returns to the list at the same scroll spot.
// PC: the list stays docked; the map only slides if the pin is off-screen.
function openFromList(s) {
  if (isDesk()) { openSheet(s, { pan: 'ifHidden', via: 'list' }); return; }
  listScroll = $('rows-wrap').scrollTop;
  hideList();
  showSheet(s, { pan: false });
  trackShop(s, 'list');
  history.pushState({ layer: 'sheet', code: s.code, fromList: true }, '', '#' + s.code);
}
let listScroll = 0;
function reopenList() {
  list.classList.add('open');
  list.setAttribute('aria-hidden', 'false');
  $('rows-wrap').scrollTop = listScroll;
}
function openList() { renderList(); list.classList.add('open'); list.setAttribute('aria-hidden', 'false'); pushLayer('list'); }
function hideList() { list.classList.remove('open'); if (!isDesk()) list.setAttribute('aria-hidden', 'true'); }

// ===== PC mode (≥1024px): docked list, hover tooltips, zoom buttons, keyboard =====
const DESK_MQ = matchMedia('(min-width: 1024px)');
function isDesk() { return DESK_MQ.matches; }
let zoomCtl = null;
function setTip(s, on) {
  if (on && !s.marker.getTooltip()) {
    const st = s.stars ? '★'.repeat(s.stars) : '★対象外';
    s.marker.bindTooltip(`${esc(s.name)}<span class="t-st">${st}</span>`, { direction: 'top', offset: [0, -14], className: 'shop-tip' });
  } else if (!on && s.marker.getTooltip()) s.marker.unbindTooltip();
}
function applyMode() {
  const d = isDesk();
  document.body.classList.toggle('desk', d);
  list.setAttribute('aria-hidden', String(!(d || list.classList.contains('open'))));
  $('search').placeholder = d ? '店名で探す( / キー)' : '店名で探す';
  if (d && !zoomCtl) zoomCtl = L.control.zoom({ position: 'topleft', zoomInTitle: '拡大', zoomOutTitle: '縮小' }).addTo(map);
  if (!d && zoomCtl) { zoomCtl.remove(); zoomCtl = null; }
  shops.forEach(s => setTip(s, d));
  if (d) renderList();
  setHeaderOffset();
}
DESK_MQ.addEventListener('change', applyMode);

addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if (e.key === 'Escape') {
    if (lightbox.classList.contains('open')) popLayer('lightbox');
    else if (infoPop.classList.contains('open')) popLayer('info');
    else if (selected) closeSheet();
    else if (!isDesk() && list.classList.contains('open')) popLayer('list');
    else if (typing) document.activeElement.blur();
  } else if (e.key === '/' && isDesk() && !typing) {
    e.preventDefault();
    $('search').focus();
  }
});
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
    if (list.classList.contains('open') || isDesk()) renderList();
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
  applyMode();
  applyFilter();
  setHeaderOffset();
  fitStations();
  // deep link: .../#<post code> opens that shop
  const hit = shops.find(s => s.code === location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  if (hit) openSheet(hit, { via: 'link', pan: 'instant' });
});
addEventListener('resize', setHeaderOffset);
setHeaderOffset();
