const fs = require('fs');
const LOG = 'C:\\Users\\elysia\\Documents\\InkStream\\InkStream-main\\.chain.txt';
const log = (...a) => fs.appendFileSync(LOG, a.join(' ') + '\n');
log('=== bootstrap ' + new Date().toISOString());
const net = require('net');
const utils = require('./node_modules/next/dist/server/lib/utils.js');
for (const p of ['pipe','pipeline','foreachPipe','setupCompilerAlias']) { log('utils.' + p + ' ' + typeof utils[p]); }
try {
  log('getFreePort present: ' + typeof utils.getFreePort);
} catch (e) { log('x ' + e.message); }
process.argv = ['node', 'next', 'dev', '--port', '3000'];
import('file:///C:/Users/elysia/Documents/InkStream/InkStream-main/node_modules/next/dist/bin/next')
  .then(() => log('imported ok'))
  .catch(e => { log('IMPORT ERR ' + e.stack); process.exit(1); });
