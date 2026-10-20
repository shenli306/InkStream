const fs = require('fs');
const LOG = 'C:\\Users\\elysia\\Documents\\InkStream\\InkStream-main\\.chain.txt';
const log = (...a) => fs.appendFileSync(LOG, a.join(' ') + '\n');
log('=== bootstrap ' + new Date().toISOString());
const cp = require('child_process');
for (const k of ['fork','spawn','exec','execFile','spawnSync','execSync']) {
  if (typeof cp[k] !== 'function') continue;
  const orig = cp[k];
  const fn = function (...args) {
    log('CP.' + k + ' ' + JSON.stringify(args.slice(0, 2).map(a => typeof a === 'function' ? '[fn]' : String(a))).slice(0, 500));
    try { return orig.apply(this, args); } catch (e) { log('CP.' + k + ' THROW ' + e.code + ' | ' + e.message); throw e; }
  };
  cp[k] = fn;
  Object.defineProperty(cp, k, { value: fn, writable: true, configurable: true });
}
log('patched fork is ' + cp.fork.name);
process.argv = ['node', 'next', 'dev', '--port', '3000'];
import('file:///C:/Users/elysia/Documents/InkStream/InkStream-main/node_modules/next/dist/bin/next')
  .then(() => log('imported ok'))
  .catch(e => { log('IMPORT ERR ' + e.stack); process.exit(1); });
