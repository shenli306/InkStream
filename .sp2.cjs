const { spawn, spawnSync } = require('child_process');
for (const [name, opts] of [['sync-inherit',{stdio:'inherit'}],['sync-pipe',{stdio:'pipe'}]]) {
  const r = spawnSync(process.execPath, ['-e','0'], opts);
  console.log(name, 'error=', r.error && r.error.code, 'status=', r.status);
}
