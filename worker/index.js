// Cloudflare Worker: visits collector + admin dashboard
// Bindings required:
// - VISITS_KV : KV Namespace binding
// - ADMIN_PASSWORD : secret (string) used to authenticate admin

const RECENT_KEY = 'recent_visits_v1';

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, event));
});

async function handleRequest(request, event) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  try {
    if (pathname === '/collect' && request.method === 'POST') return await handleCollect(request, event);
    if (pathname === '/login' && request.method === 'POST') return await handleLogin(request, event);
    if (pathname === '/stats' && request.method === 'GET') return await handleStats(request, event);
    if (pathname === '/dashboard' && request.method === 'GET') return await serveDashboard(request, event);
    return new Response('Not found', { status: 404 });
  } catch (e) {
    return new Response('Server error', { status: 500 });
  }
}

async function handleCollect(request, event) {
  // prefer Cloudflare connecting ip
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '0.0.0.0';
  const country = (request.cf && request.cf.country) ? request.cf.country : 'ZZ';
  const ua = request.headers.get('user-agent') || '';
  const ts = Date.now();

  // increment country
  const countryKey = `country:${country}`;
  const prevCountry = Number(await VISITS_KV.get(countryKey) || 0);
  await VISITS_KV.put(countryKey, String(prevCountry + 1));

  // increment ua bucket (shortened)
  const uaKey = `ua:${truncate(ua,120)}`;
  const prevUa = Number(await VISITS_KV.get(uaKey) || 0);
  await VISITS_KV.put(uaKey, String(prevUa + 1));

  // add recent list
  const raw = await VISITS_KV.get(RECENT_KEY) || '[]';
  let arr = [];
  try { arr = JSON.parse(raw); } catch(e) { arr = []; }
  arr.unshift({ ip, country, ua: truncate(ua,200), ts });
  if (arr.length > 200) arr = arr.slice(0,200);
  await VISITS_KV.put(RECENT_KEY, JSON.stringify(arr));

  return new Response(JSON.stringify({ status: 'ok' }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleLogin(request, event) {
  const secret = ADMIN_PASSWORD || '';
  if (!secret) return new Response('Admin not configured', { status: 500 });
  let body = {};
  try { body = await request.json(); } catch(e) { return new Response('Bad request', { status: 400 }); }
  const pass = body.password || '';
  if (pass !== secret) return new Response('Unauthorized', { status: 401 });
  // set HttpOnly cookie
  const headers = new Headers({ 'Set-Cookie': `ADMIN=1; HttpOnly; Secure; Path=/; SameSite=Strict; Max-Age=${60*60*24}` });
  return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers });
}

function checkAuth(request, env) {
  // check cookie ADMIN=1 or x-admin-token header equals ADMIN_PASSWORD
  const cookie = request.headers.get('cookie') || '';
  if (cookie.split(';').map(c=>c.trim()).includes('ADMIN=1')) return true;
  const header = request.headers.get('x-admin-token') || '';
  if (header && env.ADMIN_PASSWORD && header === env.ADMIN_PASSWORD) return true;
  return false;
}

async function handleStats(request, event) {
  if (!checkAuth(request, ENV)) return new Response('Unauthorized', { status: 401 });
  // Collect countries
  const countriesList = await VISITS_KV.list({ prefix: 'country:' });
  const countries = {};
  for (const k of countriesList.keys) {
    const name = k.name.split(':')[1] || 'ZZ';
    const v = Number(await VISITS_KV.get(k.name) || 0);
    countries[name] = v;
  }
  const uaList = await VISITS_KV.list({ prefix: 'ua:' });
  const uas = {};
  for (const k of uaList.keys) {
    const label = k.name.slice(3);
    const v = Number(await VISITS_KV.get(k.name) || 0);
    uas[label] = v;
  }
  const recent = JSON.parse(await VISITS_KV.get(RECENT_KEY) || '[]');
  return new Response(JSON.stringify({ countries, uas, recent }), { headers: { 'Content-Type': 'application/json' } });
}

async function serveDashboard(request, event) {
  if (!checkAuth(request, ENV)) {
    // return simple login page
    return new Response(loginHtml(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  // serve dashboard HTML
  return new Response(dashboardHtml(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function loginHtml(){
  return `<!doctype html><html><head><meta charset="utf-8"><title>Admin Login</title></head><body>
  <h2>Admin login</h2>
  <form id="f">
    <input type="password" id="p" placeholder="password" />
    <button type="submit">Login</button>
  </form>
  <script>
  document.getElementById('f').addEventListener('submit', async e => {
    e.preventDefault();
    const pass = document.getElementById('p').value;
    const res = await fetch('/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ password: pass }) });
    if (res.ok) location.reload(); else alert('Invalid');
  });
  </script>
</body></html>`;
}

function dashboardHtml(){
  return `<!doctype html><html><head><meta charset="utf-8"><title>Visits Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>body{font-family:Inter,Arial;margin:20px;color:#222} canvas{max-width:700px}</style>
  </head><body>
  <h1>Visits Dashboard</h1>
  <div><button id="refresh">Refresh</button></div>
  <h3>By Country</h3>
  <canvas id="countryChart"></canvas>
  <h3>Top User Agents</h3>
  <canvas id="uaChart"></canvas>
  <h3>Recent</h3>
  <pre id="recent"></pre>
  <script>
  async function load(){
    const r = await fetch('/stats', { credentials:'same-origin' });
    if (!r.ok){ document.body.innerText='Unauthorized'; return; }
    const j = await r.json();
    const countries = j.countries || {};
    const labels = Object.keys(countries);
    const data = Object.values(countries);
    renderChart('countryChart', labels, data);
    const uas = j.uas || {}; const ulabels = Object.keys(uas).slice(0,10); const udata = ulabels.map(k=>uas[k]);
    renderChart('uaChart', ulabels, udata);
    document.getElementById('recent').textContent = JSON.stringify(j.recent.slice(0,20), null, 2);
  }
  function renderChart(id, labels, data){
    const ctx = document.getElementById(id).getContext('2d');
    new Chart(ctx, { type:'bar', data:{ labels, datasets:[{ label:'Count', data, backgroundColor:'rgba(54,162,235,0.6)'}] }, options:{} });
  }
  document.getElementById('refresh').addEventListener('click', load);
  load();
  </script>
  </body></html>`;
}

function truncate(s,n){ if(!s) return ''; return s.length>n? s.slice(0,n): s; }

// Compatibility bindings (will be set by Cloudflare env when running)
let VISITS_KV = globalThis.VISITS_KV;
let ADMIN_PASSWORD = globalThis.ADMIN_PASSWORD;
let ENV = globalThis;
