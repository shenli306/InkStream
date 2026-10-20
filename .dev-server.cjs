/*
 * 沙箱内的 dev server 启动器。
 * 沙箱禁止 child_process 创建管道（stdio:'pipe' => spawn EPERM），
 * 而 `next dev` 默认会 fork 一个 worker 子进程来做实际的服务（cli/next-dev.js:237）。
 * 这里用伪造的 child 对象绕过 fork，在同一进程里直接以 worker 身份启动服务。
 */
const path = require('path');
const EventEmitter = require('events');
const cp = require('child_process');

process.env.NEXT_PRIVATE_WORKER = '1';
process.env.NEXT_TELEMETRY_DISABLED = '1';
delete process.env.NEXT_DISABLE_MEM_OVERRIDE;

const originalFork = cp.fork;
cp.fork = function (modulePath, options) {
  if (!String(modulePath).includes('start-server')) {
    return originalFork.apply(this, arguments);
  }
  const child = new EventEmitter();
  child.pid = process.pid;
  child.exitCode = null;
  child.killed = false;
  child.send = (msg, cb) => {
    setImmediate(() => {
      if (msg && msg.nextWorkerOptions) {
        process.emit('message', msg);
      }
      if (typeof cb === 'function') cb(null);
    });
    return true;
  };
  child.kill = () => {
    process.exit(0);
    return true;
  };
  child.disconnect = () => {
    process.disconnect && process.disconnect();
  };
  child.connected = true;

  // worker 侧握手：start-server.js:442 会直接 process.send({nextWorkerReady:true})
  process.send = (msg, cb) => {
    setImmediate(() => {
      child.emit('message', msg);
      if (typeof cb === 'function') cb(null);
    });
    return true;
  };

  setImmediate(() => {
    try {
      require(modulePath).startServer({
        dir: options.env && options.env.NEXT_PRIVATE_DIR ? options.env.NEXT_PRIVATE_DIR : process.cwd(),
        port: 3000,
        isDev: true,
        allowRetry: true,
        hostname: undefined,
      }).catch((err) => {
        console.error('[dev-server] startServer failed:', err);
        process.exit(1);
      });
    } catch (err) {
      console.error('[dev-server] startServer threw:', err);
      process.exit(1);
    }
  });

  return child;
};

process.argv = [process.argv[0], path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '--port', '3000'];

import('file:///' + path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next').replace(/\\/g, '/')).catch((err) => {
  console.error('[dev-server] boot failed:', err);
  process.exit(1);
});
