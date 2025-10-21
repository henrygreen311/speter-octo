// batch_main.js
// Usage: node batch_main.js

const { exec } = require('child_process');

const totalRuns = 2;
let currentRun = 0;

console.log(`🚀 Starting batch main — will run main.js ${totalRuns} times.\n`);

function runCreator() {
  if (currentRun >= totalRuns) {
    console.log(`✅ All ${totalRuns} runs completed. Exiting.`);
    process.exit(0);
  }

  currentRun++;
  console.log(`\n⚙️  Run ${currentRun} of ${totalRuns} starting...`);

  const startTime = Date.now();
  const processInstance = exec('node main.js', { timeout: 10 * 60 * 1000 }); // 10-min timeout safeguard

  processInstance.stdout.on('data', (data) => process.stdout.write(data));
  processInstance.stderr.on('data', (data) => process.stderr.write(data));

  processInstance.on('close', (code) => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (code === 0) {
      console.log(`✅ Run ${currentRun} completed successfully in ${duration}s.`);
    } else {
      console.warn(`⚠️ Run ${currentRun} failed (exit code ${code}). Skipping and continuing...`);
    }

    // Small delay between runs to prevent resource overlap
    setTimeout(runCreator, 2000);
  });

  processInstance.on('error', (err) => {
    console.error(`❌ Unexpected error on run ${currentRun}: ${err.message}`);
    setTimeout(runCreator, 2000);
  });
}

// Start first run
runCreator();
