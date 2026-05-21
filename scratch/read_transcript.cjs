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

  console.log('Searching transcript for database / file operations...');
  let index = 0;
  for await (const line of rl) {
    index++;
    const step = JSON.parse(line);
    const text = JSON.stringify(step);
    if (text.includes('agridb') || text.includes('db.js') || text.includes('import') || text.includes('delete') || text.includes('unlink')) {
      // Print context summary
      console.log(`[Step ${index}] Type: ${step.type}, Status: ${step.status}`);
      if (step.tool_calls) {
        for (const tc of step.tool_calls) {
          if (tc.name === 'run_command') {
            console.log(`  Cmd: ${tc.args.CommandLine}`);
          } else if (tc.name === 'write_to_file' || tc.name === 'replace_file_content') {
            console.log(`  File Edit: ${tc.args.TargetFile}`);
          }
        }
      }
    }
  }
}

processLineByLine();
