
const { spawn } = require('child_process');
const fs = require('fs');
const out = fs.openSync('.dev-server-run.log', 'a');
const child = spawn('C:\\Program Files\\nodejs\\node.exe', ['node_modules/next/dist/bin/next', 'dev', '-p', '3100'], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'development' },
  stdio: ['ignore', out, out],
  detached: true,
});
child.unref();
fs.writeFileSync('.dev-server.pid', String(child.pid));
console.log('dev server pid', child.pid);
