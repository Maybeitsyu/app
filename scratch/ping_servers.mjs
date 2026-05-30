import http from 'node:http';

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/`, { timeout: 1000 }, (res) => {
      console.log(`Port ${port} is active, status code: ${res.statusCode}`);
      resolve(true);
    });
    req.on('error', (err) => {
      console.log(`Port ${port} is down: ${err.message}`);
      resolve(false);
    });
  });
}

console.log('Checking active server ports...');
await checkPort(5173);
await checkPort(3847);
process.exit(0);
