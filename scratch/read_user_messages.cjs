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

  console.log('USER MESSAGES IN TRANSCRIPT:');
  for await (const line of rl) {
    const step = JSON.parse(line);
    if (step.type === 'USER_INPUT') {
      console.log(`[USER]: ${step.content}`);
    }
  }
}

processLineByLine();
