// batch_runner.js
// Usage: node batch_runner.js

const { exec } = require("child_process");

const totalRuns = 6; // adjust as needed
let currentRun = 0;

console.log(`Starting batch runner â executing creator.js ${totalRuns} times.\n`);

function runCreator() {
  if (currentRun >= totalRuns) {
    console.log(`All ${totalRuns} runs completed. Exiting.`);
    process.exit(0);
  }

  currentRun++;
  console.log(`\n--- Run ${currentRun} of ${totalRuns} starting ---`);

  const startTime = Date.now();
  const processInstance = exec("node creator.js", { timeout: 10 * 60 * 1000 }); // 10 min timeout safeguard

  processInstance.stdout.on("data", (data) => process.stdout.write(data));
  processInstance.stderr.on("data", (data) => process.stderr.write(data));

  processInstance.on("close", (code) => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (code === 0) {
      console.log(`Run ${currentRun} completed successfully in ${duration}s.`);
    } else {
      console.warn(`Run ${currentRun} failed (exit code ${code}). Continuing to next run.`);
    }

    // Delay between runs to prevent overlap
    setTimeout(runCreator, 2000);
  });

  processInstance.on("error", (err) => {
    console.error(`Unexpected error during run ${currentRun}: ${err.message}`);
    setTimeout(runCreator, 2000);
  });
}

runCreator(
