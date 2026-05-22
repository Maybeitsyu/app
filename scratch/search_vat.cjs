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

  // Filter steps that did code edits on db.js or UI files that might contain VAT
  console.log('Searching for VAT edits in transcript...');
  const vatEdits = steps.filter(step => {
    const str = JSON.stringify(step);
    return str.includes('Net of vat') || str.includes('input_vat') || str.includes('net_of_vat');
  });

  console.log(`Found ${vatEdits.length} steps related to VAT.`);
  for (const step of vatEdits.slice(-10)) {
    console.log(`\n========================================`);
    console.log(`Step ${step.step_index} | Source: ${step.source} | Type: ${step.type}`);
    if (step.tool_calls) {
      step.tool_calls.forEach(tc => {
        if (tc.name === 'replace_file_content' || tc.name === 'write_to_file') {
          console.log(`  File: ${tc.args.TargetFile}`);
          console.log(`  Desc: ${tc.args.Description}`);
        }
      });
    }
  }
}

processLineByLine();
