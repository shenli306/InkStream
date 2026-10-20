const { spawn } = require('child_process');
const tests = [
  { name: 'node-inherit', cmd: process.execPath, args: ['-e','console.log(1)'], opts: { stdio: 'inherit' } },
  { name: 'node-pipe',    cmd: process.execPath, args: ['-e','console.log(1)'], opts: { stdio: 'pipe' } },
  { name: 'cmd-inherit',  cmd: 'cmd.exe', args: ['/c','echo hi'], opts: { stdio: 'inherit' } },
  { name: 'cmd-pipe',     cmd: 'cmd.exe', args: ['/c','echo hi'], opts: { stdio: 'pipe' } },
  { name: 'node-pipe-shell', cmd: process.execPath, args: ['-e','console.log(1)'], opts: { stdio: 'pipe', shell: true } },
];
(async () => {
  for (const t of tests) {
    await new Promise((res) => {
      let c;
      try { c = spawn(t.cmd, t.args, t.opts); } catch (e) { console.log(t.name, 'THROW', e.code); return res(); }
      if (c.stdout) c.stdout.on('data', d => console.log(t.name, 'OUT', String(d).trim()));
      if (c.stderr) c.stderr.on('data', d => console.log(t.name, 'ERR', String(d).trim()));
      c.on('error', e => { console.log(t.name, 'ERROR', e.code); res(); });
      c.on('exit', code => { console.log(t.name, 'exit', code); res(); });
      setTimeout(() => { console.log(t.name, 'TIMEOUT'); try{c.kill()}catch{}; res(); }, 5000);
    });
  }
})();
