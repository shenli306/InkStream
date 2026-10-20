const { spawn } = require('child_process');
const tests = [
  ['detached+hide+shellfalse+no-stdio', { detached: true, windowsHide: true, shell: false }],
  ['detached-only', { detached: true }],
  ['pipe-only', { stdio: 'pipe' }],
  ['inherit-extras', { stdio: 'inherit', windowsHide: true }],
  ['default', {}],
];
(async () => {
  for (const [name, opts] of tests) {
    const r = await new Promise(res => {
      let c;
      try { c = spawn(process.execPath, ['-e','0'], opts); } catch (e) { return res('THROW ' + e.code); }
      c.on('error', e => res('ERROR ' + e.code));
      c.on('exit', code => res('exit ' + code));
      setTimeout(() => res('TIMEOUT'), 4000);
    });
    console.log(name, '=>', r);
  }
})();
