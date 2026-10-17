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
function lineName(name, color, latlng) {
  L.marker(latlng, {
    pane: 'stations', interactive: false, keyboard: false,
    icon: L.divIcon({ className: 'line-name', html: `<span style="border-left-color:${color}">${name}</span>`, iconSize: [0, 0] }),
  }).addTo(map);
}
lineName('JR山手線', '#80C241', [35.73665, 139.74722]);
// Lines serving Kagurazaka / Iidabashi (OpenStreetMap, clipped to central Tokyo, simplified ~8 m): name, color, label spot, path
const LOCAL_LINES = [
  ['JR中央・総武線', '#FFD400', [35.70139, 139.76067], [[35.69689,139.81987],[35.69603,139.80186],[35.69559,139.79564],[35.69576,139.79296],[35.69591,139.79165],[35.69695,139.78871],[35.69712,139.7879],[35.69882,139.76773],[35.70004,139.76334],[35.70109,139.76171],[35.70139,139.76067],[35.70134,139.75795],[35.70198,139.75461],[35.70248,139.74728],[35.70243,139.74655],[35.70217,139.74565],[35.70139,139.74452],[35.69291,139.73783],[35.69152,139.73601],[35.68971,139.73253],[35.6889,139.73166],[35.68827,139.73131],[35.68449,139.73029],[35.68345,139.72982],[35.683,139.72943],[35.68259,139.72881],[35.68023,139.7238],[35.67987,139.72268],[35.67982,139.72176],[35.68149,139.70951],[35.68138,139.705],[35.68172,139.7039],[35.68224,139.70311],[35.68318,139.70236],[35.68611,139.70141],[35.68808,139.70038],[35.69037,139.69986],[35.69269,139.69988],[35.69493,139.69927],[35.69663,139.69923],[35.69832,139.69874],[35.7011,139.69706],[35.70206,139.69627],[35.70398,139.69416],[35.70477,139.6928],[35.7053,139.69149],[35.70584,139.68946],[35.70625,139.68673],[35.70598,139.67542],[35.70575,139.67039]]],
  ['東西線', '#009BBF', [35.70475, 139.73017], [[35.70593,139.67006],[35.70624,139.67453],[35.70655,139.67596],[35.70699,139.67696],[35.70865,139.67951],[35.70973,139.68182],[35.71002,139.6827],[35.71119,139.6883],[35.71131,139.69003],[35.71118,139.69258],[35.71171,139.69714],[35.7124,139.69974],[35.71362,139.70229],[35.71381,139.7034],[35.71371,139.7043],[35.71196,139.70772],[35.71135,139.71078],[35.71004,139.71343],[35.70943,139.71622],[35.70901,139.71684],[35.70756,139.71789],[35.70653,139.71896],[35.706,139.71996],[35.70545,139.72475],[35.70472,139.72737],[35.70475,139.73017],[35.70429,139.73197],[35.70324,139.73794],[35.70342,139.74115],[35.70292,139.74275],[35.70257,139.74472],[35.7006,139.74773],[35.69762,139.75059],[35.697,139.75095],[35.6949,139.75165],[35.69423,139.75214],[35.69387,139.75274],[35.69305,139.75464],[35.69269,139.75506],[35.69124,139.75619],[35.69089,139.75666],[35.68984,139.75958],[35.68937,139.76034],[35.68866,139.76082],[35.68634,139.76134],[35.68562,139.76201],[35.68531,139.76274],[35.68486,139.76551],[35.68361,139.77098],[35.6803,139.77943],[35.67956,139.78107],[35.67646,139.78618],[35.67604,139.78732],[35.67561,139.7892],[35.67321,139.79304],[35.67016,139.80018],[35.66962,139.80249],[35.66934,139.8096],[35.66975,139.81996]]],
  ['有楽町線', '#C1A470', [35.716, 139.729], [[35.74651,139.67267],[35.7434,139.67981],[35.73964,139.68768],[35.73486,139.69394],[35.73422,139.69499],[35.73368,139.69651],[35.73288,139.7008],[35.73288,139.70373],[35.73276,139.70422],[35.73188,139.70626],[35.7302,139.70871],[35.72971,139.70973],[35.72891,139.7121],[35.72776,139.71411],[35.72766,139.71445],[35.7276,139.71642],[35.72691,139.7177],[35.72321,139.72354],[35.72223,139.72481],[35.72015,139.72694],[35.71181,139.73108],[35.71064,139.73145],[35.71024,139.73178],[35.70998,139.73224],[35.70913,139.73486],[35.70809,139.74149],[35.70778,139.74227],[35.70736,139.74283],[35.70634,139.74348],[35.704,139.74429],[35.70312,139.74447],[35.70264,139.74438],[35.69646,139.74006],[35.69236,139.73678],[35.69112,139.73595],[35.68995,139.73558],[35.6888,139.73563],[35.68297,139.73813],[35.68143,139.73832],[35.68061,139.7386],[35.67966,139.73924],[35.67886,139.74015],[35.67799,139.74161],[35.67755,139.74303],[35.67753,139.74426],[35.67783,139.74566],[35.67784,139.74675],[35.67731,139.75004],[35.67762,139.753],[35.67758,139.75401],[35.67692,139.75844],[35.67504,139.76603],[35.67147,139.77143],[35.67017,139.7747],[35.66925,139.77865],[35.6688,139.77962],[35.66814,139.78039],[35.66671,139.78163],[35.66491,139.78436],[35.66176,139.78788],[35.65916,139.79218],[35.65638,139.79484],[35.65231,139.79907],[35.65023,139.80191],[35.6498,139.8029],[35.64904,139.80533],[35.64528,139.81111],[35.6444,139.81293],[35.64426,139.81404],[35.64432,139.81479],[35.64503,139.81724],[35.64531,139.8196]]],
  ['南北線', '#00AC9B', [35.71127, 139.75322], [[35.63249,139.71568],[35.63321,139.71548],[35.63405,139.71548],[35.63454,139.71573],[35.63498,139.71628],[35.63521,139.71701],[35.6354,139.72036],[35.63554,139.72106],[35.63899,139.72832],[35.64005,139.73007],[35.64039,139.73205],[35.64075,139.73281],[35.64121,139.73319],[35.64582,139.73577],[35.64892,139.73674],[35.65016,139.73688],[35.65241,139.73662],[35.65578,139.7371],[35.65657,139.73696],[35.65778,139.73635],[35.65856,139.73629],[35.65974,139.73661],[35.66135,139.73777],[35.6628,139.73814],[35.66496,139.73894],[35.66671,139.73919],[35.66902,139.74098],[35.66969,139.74128],[35.67605,139.74152],[35.67716,139.74106],[35.67761,139.74064],[35.6782,139.73976],[35.67875,139.73852],[35.67891,139.73783],[35.67878,139.7352],[35.679,139.73404],[35.6793,139.73351],[35.6808,139.73209],[35.68232,139.73012],[35.68329,139.7295],[35.68447,139.72925],[35.68558,139.72942],[35.68844,139.73034],[35.68927,139.73091],[35.68972,139.73139],[35.69111,139.73384],[35.69392,139.7374],[35.69645,139.73944],[35.69907,139.74216],[35.70099,139.74329],[35.70192,139.74397],[35.70245,139.74455],[35.70278,139.74515],[35.70315,139.74628],[35.70326,139.74742],[35.70321,139.74992],[35.7034,139.75064],[35.70377,139.75122],[35.70425,139.75162],[35.70489,139.75181],[35.70981,139.75172],[35.7104,139.75189],[35.71107,139.7526],[35.71127,139.75322],[35.71147,139.75462],[35.71204,139.7556],[35.71366,139.75698],[35.71448,139.7573],[35.71557,139.75814],[35.71627,139.75842],[35.71807,139.75789],[35.71892,139.75737],[35.72304,139.75413],[35.72412,139.75377],[35.72631,139.75338],[35.7277,139.75235],[35.72997,139.75127],[35.73376,139.74811],[35.73597,139.74669],[35.73775,139.74615],[35.73835,139.74614],[35.74126,139.74735],[35.74196,139.74741],[35.74281,139.74712],[35.74345,139.74649],[35.74383,139.7459],[35.74504,139.74321],[35.74715,139.74106],[35.74878,139.73898],[35.74978,139.7382],[35.75046,139.73792],[35.75133,139.7378],[35.75291,139.73785],[35.755,139.73708],[35.75943,139.73753]]],
  ['大江戸線', '#B6007A', [35.69911, 139.72993], [[35.73264,139.67044],[35.73154,139.67344],[35.72919,139.67828],[35.72759,139.681],[35.72686,139.6817],[35.72377,139.68328],[35.72293,139.68387],[35.7223,139.68456],[35.71977,139.6881],[35.71909,139.68847],[35.71819,139.68834],[35.70619,139.68282],[35.70253,139.68243],[35.70078,139.68299],[35.69993,139.68311],[35.69728,139.68299],[35.69066,139.68178],[35.68986,139.68206],[35.6895,139.68264],[35.68945,139.68301],[35.6895,139.68353],[35.69047,139.68586],[35.69049,139.6865],[35.69018,139.68789],[35.69013,139.68917],[35.69117,139.69566],[35.69131,139.69738],[35.69125,139.69789],[35.69106,139.69828],[35.69042,139.69874],[35.6886,139.69905],[35.68661,139.69983],[35.6853,139.70112],[35.68149,139.70217],[35.68091,139.70241],[35.68067,139.70266],[35.68026,139.70363],[35.68022,139.7041],[35.68038,139.70479],[35.68113,139.70645],[35.68122,139.70946],[35.67964,139.71576],[35.6796,139.71742],[35.67941,139.71851],[35.67883,139.71972],[35.67784,139.72066],[35.67522,139.72204],[35.67416,139.72342],[35.67192,139.72456],[35.67174,139.72482],[35.67126,139.72619],[35.67089,139.72659],[35.66766,139.72733],[35.66701,139.72762],[35.66643,139.72821],[35.6644,139.73112],[35.66335,139.73227],[35.66169,139.73294],[35.65912,139.73233],[35.65879,139.73238],[35.65751,139.73303],[35.65702,139.734],[35.6561,139.73868],[35.6553,139.74176],[35.65491,139.74569],[35.65421,139.7476],[35.65396,139.74882],[35.6541,139.74938],[35.65448,139.74978],[35.6566,139.75016],[35.65696,139.75049],[35.65713,139.75086],[35.65716,139.75146],[35.65663,139.75693],[35.65674,139.75744],[35.65706,139.75787],[35.65747,139.75806],[35.66043,139.75886],[35.66207,139.75915],[35.66486,139.76167],[35.66658,139.76283],[35.66687,139.76325],[35.66701,139.76397],[35.6667,139.76481],[35.66531,139.76639],[35.66203,139.77069],[35.661,139.77149],[35.65939,139.77196],[35.65882,139.77228],[35.65755,139.77361],[35.65741,139.77394],[35.65738,139.7745],[35.65757,139.77501],[35.65975,139.77819],[35.66527,139.78594],[35.66585,139.78664],[35.66755,139.78812],[35.66891,139.79061],[35.67079,139.79307],[35.67221,139.79461],[35.67415,139.79588],[35.67562,139.79605],[35.6761,139.79624],[35.6796,139.79897],[35.68317,139.79855],[35.7033,139.79684],[35.70369,139.79649],[35.70418,139.79492],[35.70484,139.79391],[35.7053,139.79292],[35.70603,139.79069],[35.70623,139.78921],[35.70776,139.7751],[35.7083,139.76886],[35.70815,139.76809],[35.70756,139.76689],[35.70734,139.76604],[35.7075,139.76112],[35.70725,139.75711],[35.70747,139.75592],[35.70839,139.75393],[35.70845,139.75102],[35.70817,139.75015],[35.70667,139.74826],[35.70631,139.74799],[35.70486,139.7474],[35.7039,139.74714],[35.70359,139.74689],[35.70335,139.74642],[35.70271,139.7448],[35.70263,139.74426],[35.70295,139.7424],[35.70341,139.74111],[35.70326,139.73956],[35.70304,139.73909],[35.70144,139.73724],[35.70062,139.73532],[35.69935,139.73159],[35.69911,139.72993],[35.69941,139.7281],[35.69938,139.72598],[35.69997,139.72104],[35.69881,139.71699],[35.69777,139.71458],[35.69764,139.70945],[35.69822,139.70488],[35.69824,139.70397],[35.69797,139.69868],[35.69771,139.69813],[35.69712,139.6979],[35.69351,139.6992],[35.69235,139.69929],[35.69177,139.69904],[35.69142,139.69859],[35.6913,139.69819],[35.69106,139.69568],[35.69059,139.69282]]],
];
LOCAL_LINES.forEach(([name, color, at, path]) => {
  L.polyline(path, { pane: 'rail', interactive: false, color, opacity: 0.55, weight: 3, lineJoin: 'round' }).addTo(map);
  lineName(name, color, at);
});

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
