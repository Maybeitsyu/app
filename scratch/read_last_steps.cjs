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

  const filteredSteps = steps.filter(step => step.step_index >= 1520);
  for (const step of filteredSteps) {
    console.log(`\n========================================`);
    console.log(`Step ${step.step_index} | Source: ${step.source} | Type: ${step.type} | Status: ${step.status}`);
    if (step.content) {
      console.log(`Content: ${step.content.slice(0, 1000)}${step.content.length > 1000 ? '...' : ''}`);
    }
    if (step.tool_calls) {
      console.log(`Tool Calls:`, JSON.stringify(step.tool_calls, null, 2));
    }
  }
}

processLineByLine();
