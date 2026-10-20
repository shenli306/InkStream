const { spawnSync } = require('child_process');
const fs = require('fs');
// 用一个脱离父进程的 shell 间接启动
const cmd = 'start "" /B "C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\elysia\\Documents\\InkStream\\InkStream-main\\.dev-run.cjs"';
fs.writeFileSync('.dev-launch.log', 'launch at ' + new Date().toISOString() + '\n');
const r = spawnSync('cmd.exe', ['/c', cmd], { cwd: 'C:\\Users\\elysia\\Documents\\InkStream\\InkStream-main', stdio: 'inherit' });
fs.appendFileSync('.dev-launch.log', 'cmd status=' + r.status + ' error=' + (r.error && r.error.code) + '\n');
