/**
 * Wait for Vite dev server to be ready before launching Electron
 */
const http = require('http');

const VITE_URL = 'http://localhost:5173';
const MAX_RETRIES = 30;
const RETRY_DELAY = 1000;

let retries = 0;

function check() {
  http.get(VITE_URL, (res) => {
    if (res.statusCode === 200) {
      console.log('✓ Vite dev server is ready');
      process.exit(0);
    } else {
      retry();
    }
  }).on('error', retry);
}

function retry() {
  retries++;
  if (retries >= MAX_RETRIES) {
    console.error('✗ Vite dev server did not start in time');
    process.exit(1);
  }
  console.log(`Waiting for Vite... (${retries}/${MAX_RETRIES})`);
  setTimeout(check, RETRY_DELAY);
}

check();
