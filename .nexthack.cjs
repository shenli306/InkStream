const fs = require('fs');
const log = (...a) => fs.appendFileSync('.spawnstack.txt', a.join(' ') + "\n");
log("=== start", new Date().toISOString());
const cp = require('child_process');
const orig = cp.spawn;
function patched(...args) {
  const opts = args[2] === undefined ? {} : args[2];
  const bad = !opts || (!opts.stdio && !opts.shell && !opts.detached && !opts.windowsHide);
  log("SPAWN:", JSON.stringify({ cmd: args[0], args: args[1], opts, callerIsThisProbe: __filename }));
  log(new Error('trace').stack);
  if (bad) {
    // 沙箱不让建管道：强制继承 stdio
    args[2] = new Proxy({}, {
      get(t, p) {
        if (p === 'stdio') return 'inherit';
        return opts ? opts[p] : undefined;
      },
      set() { return true; },
      ownKeys() { return opts ? Reflect.ownKeys(opts).concat(['stdio']) : ['stdio']; },
      getOwnPropertyDescriptor(t, p) { return { enumerable: true, configurable: true, writable: true, value: p === 'stdio' ? 'inherit' : opts?.[p] }; },
    });
  }
  return orig.apply(this, args);
}
cp.spawn = patched;
try {
  process.argv = [process.argv[0], 'C:\\Users\\elysia\\Documents\\InkStream\\InkStream-main\\node_modules\\next\\dist\\bin\\next', 'dev', '--port', '3000'];
  require('C:/Users/elysia/Documents/InkStream/InkStream-main/node_modules/next/dist/bin/next');
} catch (e) { log('BOOT ERROR', e.stack); }
