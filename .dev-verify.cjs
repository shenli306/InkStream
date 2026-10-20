
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

const results = { steps: [] };
function log(msg) { results.steps.push(msg); console.log(msg); }

const child = spawn('C:\\Program Files\\nodejs\\node.exe', ['node_modules/next/dist/bin/next', 'dev', '-p', '3100'], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'development' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
child.stdout.on('data', d => serverLog += d);
child.stderr.on('data', d => serverLog += d);
child.on('error', e => log('CHILD ERROR: ' + e.message));
child.on('exit', (c, sig) => log('CHILD EXIT code=' + c + ' sig=' + sig));

function get(url, cb) {
  const req = http.get(url, res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => cb(null, res.statusCode, body));
  });
  req.on('error', e => cb(e));
  req.setTimeout(15000, () => req.destroy(new Error('timeout')));
}

setTimeout(() => {
  log('server log so far: ' + serverLog.slice(0, 300).replace(/\n/g, ' | '));
  get('http://127.0.0.1:3100/', (err, status, html) => {
    if (err) { log('FETCH ERROR: ' + err.message); finish(); return; }
    log('HTTP ' + status + ' bytes=' + html.length);
    log('has ink-decoration: ' + html.includes('ink-decoration'));
    log('has text-content-primary: ' + html.includes('text-content-primary'));
    log('has heading-display: ' + html.includes('heading-display'));
    const m = html.match(/href="([^"]*globals[^"]*)"/);
    log('globals link: ' + (m ? m[1] : 'none'));
    if (m) {
      get('http://127.0.0.1:3100' + m[1], (e2, s2, css) => {
        if (e2) { log('CSS FETCH ERROR: ' + e2.message); finish(); return; }
        log('CSS HTTP ' + s2 + ' bytes=' + css.length);
        log('css has #0d0c15: ' + css.includes('#0d0c15'));
        log('css has .ink-decoration: ' + css.includes('.ink-decoration'));
        log('css has mix-blend-mode screen: ' + css.includes('mix-blend-mode: screen'));
        log('css has mix-blend-mode overlay: ' + css.includes('mix-blend-mode: overlay'));
        log('css has ink-drift keyframes: ' + css.includes('@keyframes ink-drift'));
        finish();
      });
    } else finish();
  });
}, 12000);

function finish() {
  fs.writeFileSync('.dev-verify-results.txt', results.steps.join('\n'));
  child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 2000);
}
