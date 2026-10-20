process.env.NEXT_PRIVATE_WORKER = '1';
process.env.NEXT_TELEMETRY_DISABLED = '1';
const fs = require('fs');
const out = fs.openSync('C:\\Users\\elysia\\Documents\\InkStream\\InkStream-main\\.devserver.log', 'a');
require('./node_modules/next/dist/server/lib/start-server.js').startServer({
  dir: process.cwd(), port: 3100, isDev: true, allowRetry: false, hostname: '127.0.0.1'
}).catch(e => { fs.writeSync(out, 'FATAL ' + (e && e.stack) + '\n'); process.exit(1); });
