const fs = require('fs');
const path = require('path');
const readline = require('readline');

const transcriptPath = path.resolve('C:\\Users\\ufuni\\.gemini\\antigravity\\brain\\d1767f6a-2b6e-4f69-96d3-9144e8c10167\\.system_generated\\logs\\transcript.jsonl');

async function processLineByLine() {
  const fileStream = fs.createReadStream(transcriptPath);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const steps = [];
  for await (const line of rl) {
    steps.push(JSON.parse(line));
  }

  console.log(`Total steps in array: ${steps.length}`);
  const last50 = steps.slice(-50);
  for (const step of last50) {
    console.log(`Array index: ${steps.indexOf(step)} | Step Index: ${step.step_index} | Source: ${step.source} | Type: ${step.type}`);
  }
}

processLineByLine();
