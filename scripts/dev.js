import { spawn } from 'node:child_process';

const rendererUrl = 'http://127.0.0.1:5173';
const isWindows = process.platform === 'win32';

let rendererProcess = null;
let electronProcess = null;
let shuttingDown = false;

function spawnProcess(command, args = [], extraEnv = {}) {
  return spawn(command, args, {
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv
    }
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until Vite is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  throw new Error(`Timed out waiting for the renderer at ${url}`);
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (electronProcess && !electronProcess.killed) {
    electronProcess.kill();
  }

  if (rendererProcess && !rendererProcess.killed) {
    rendererProcess.kill();
  }

  process.exit(exitCode);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  rendererProcess = spawnProcess('vite');

  await waitForServer(rendererUrl);

  const electronCommand = isWindows ? 'electron.cmd' : 'electron';
  electronProcess = spawnProcess(electronCommand, ['.'], {
    VITE_DEV_SERVER_URL: rendererUrl
  });

  electronProcess.on('exit', (code) => shutdown(code ?? 0));
  rendererProcess.on('exit', (code) => {
    if (!shuttingDown) {
      shutdown(code ?? 0);
    }
  });
}

main().catch((error) => {
  console.error(error);
  shutdown(1);
});
