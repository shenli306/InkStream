const fs = require('fs');
const log = (...a) => fs.appendFileSync('C:\\Users\\elysia\\Documents\\InkStream\\InkStream-main\\.spawnstack.txt', a.join(' ') + "\n");
log("=== start", new Date().toISOString(), "args:", JSON.stringify(process.argv));
process.on('uncaughtException', e => { log('UNCAUGHT', e && e.stack); });
const cp = require('child_process');
for (const name of ['spawn','spawnSync','execSync','exec']) {
  const orig = cp[name];
  cp[name] = function (...args) {
    log('CALL ' + name + ' ' + JSON.stringify(args.slice(0,2)) + ' opts=' + JSON.stringify(args[2]));
    try { return orig.apply(this, args); }
    catch (e) { log('THROW in ' + name + ': ' + e.code + ' ' + e.message); log(new Error('stack').stack); throw e; }
  };
}
try {
  require('./node_modules/next/dist/bin/next');
} catch (e) { log('BOOT ERROR', e.stack); }
