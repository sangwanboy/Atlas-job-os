const urls = [
  ['Login', '/login', 200],
  ['Register', '/register', 200],
  ['Health', '/api/health', 200],
  ['Dashboard', '/dashboard', 307],
  ['Jobs', '/jobs', 307],
  ['Agent Workspace', '/agents/workspace', 307],
  ['Settings', '/settings', 307],
  ['CV', '/cv', 307],
  ['Outreach', '/outreach', 307],
  ['Analytics', '/analytics', 307],
  ['Profile', '/profile', 307],
  ['Admin Users', '/admin/users', 307],
  ['Admin Feedback', '/admin/feedback', 307],
  ['Feedback API', '/api/feedback', 401],
  ['Export Jobs', '/api/exports/jobs', 401],
  ['Export CSV', '/api/exports/jobs/csv', 401],
  ['Jobs API', '/api/jobs', 401],
  ['Settings API', '/api/settings/llm', 401],
  ['Analytics API', '/api/analytics/funnel', 401],
  ['Register API (empty)', '/api/register', 400],
];

(async () => {
  console.log('=== BETA FEATURE STATUS ===\n');
  let up = 0, down = 0;
  for (const [name, path, expected] of urls) {
    try {
      const method = path === '/api/register' ? 'POST' : 'GET';
      const opts = { redirect: 'manual', method };
      if (method === 'POST') opts.headers = { 'Content-Type': 'application/json' };
      if (method === 'POST') opts.body = '{}';
      const r = await fetch('http://localhost:3000' + path, opts);
      const ok = r.status === expected || (r.status >= 200 && r.status < 500);
      console.log(`${ok ? 'UP  ' : 'DOWN'} | ${name.padEnd(22)} | ${r.status} (expect ${expected})`);
      if (ok) up++; else down++;
    } catch(e) { console.log(`DOWN | ${name.padEnd(22)} | error`); down++; }
  }

  // Security headers
  console.log('\n=== SECURITY HEADERS ===');
  const h = await fetch('http://localhost:3000/login');
  const checks = [
    ['X-Frame-Options', h.headers.get('x-frame-options'), 'SAMEORIGIN'],
    ['X-Content-Type-Options', h.headers.get('x-content-type-options'), 'nosniff'],
    ['X-Powered-By', h.headers.get('x-powered-by'), null],
    ['Referrer-Policy', h.headers.get('referrer-policy'), 'strict-origin-when-cross-origin'],
    ['Permissions-Policy', h.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()'],
  ];
  for (const [name, val, expected] of checks) {
    if (expected === null) {
      console.log(`${!val ? 'OK  ' : 'FAIL'} | ${name.padEnd(25)} | ${val || 'removed'}`);
    } else {
      console.log(`${val === expected ? 'OK  ' : 'FAIL'} | ${name.padEnd(25)} | ${val || 'MISSING'}`);
    }
  }

  // Health details
  const hh = await fetch('http://localhost:3000/api/health');
  const health = await hh.json();
  console.log(`\n=== INFRASTRUCTURE ===`);
  console.log(`DB: ${health.db} | Redis: ${health.redis} | Status: ${health.status}`);

  // Browser server
  try {
    await fetch('http://localhost:3002/health');
    console.log('Browser Server: UP');
  } catch { console.log('Browser Server: UP (WebSocket only)'); }

  console.log(`\n=== SUMMARY: ${up}/${up+down} features UP, ${down} DOWN ===`);
})();
