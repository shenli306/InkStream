const fs = require('fs');
const LOG = 'C:\\Users\\elysia\\Documents\\InkStream\\InkStream-main\\.chain.txt';
const log = (...a) => fs.appendFileSync(LOG, a.join(' ') + '\n');
log('=== bootstrap ' + new Date().toISOString());
const cp = require('child_process');
for (const k of Object.keys(cp)) {
  if (typeof cp[k] === 'function') {
    const orig = cp[k];
    cp[k] = function (...args) {
      log('CP.' + k + ' ' + JSON.stringify(args.map(a => typeof a === 'function' ? '[fn]' : a).slice(0, 3)).slice(0, 400));
      try { return orig.apply(this, args); } catch (e) { log('CP.' + k + ' THROW ' + e.code); throw e; }
    };
  }
}
const mod = require('./node_modules/next/dist/server/lib/start-server.js');
log('start-server exports: ' + Object.keys(mod).join(','));
log('useWorkers fn: ' + typeof mod.startServer);
