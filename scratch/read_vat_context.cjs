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

  // Filter steps by step_index between 1120 and 1380
  const filteredSteps = steps.filter(step => step.step_index >= 1120 && step.step_index <= 1380);
  
  // To avoid overwhelming output, let's print summary of changes and code action content
  console.log(`Matching steps in index range 1120-1380: ${filteredSteps.length}`);
  
  for (const step of filteredSteps) {
    if (step.type === 'USER_INPUT' || (step.tool_calls && step.tool_calls.some(t => t.name === 'replace_file_content' || t.name === 'write_to_file')) || (step.content && step.content.includes('VAT'))) {
      console.log(`\n========================================`);
      console.log(`Step ${step.step_index} | Source: ${step.source} | Type: ${step.type} | Status: ${step.status}`);
      if (step.content) {
        console.log(`Content: ${step.content.slice(0, 500)}${step.content.length > 500 ? '...' : ''}`);
      }
      if (step.tool_calls) {
        console.log(`Tool Calls:`, JSON.stringify(step.tool_calls, null, 2));
      }
    }
  }
}

processLineByLine();
