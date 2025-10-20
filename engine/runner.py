import subprocess
import time
import sys

# Configurations
total_runs = 6
log_file = "run_log.txt"

# Open log file for both read & write
with open(log_file, "w", encoding="utf-8") as log:
    for i in range(1, total_runs + 1):
        header = f"\nð Running iteration {i}...\n"
        print(header, flush=True)
        log.write(header)

        # Run node script with live output
        process = subprocess.Popen(
            ["node", "main.js"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        # Stream stdout and stderr live to console and log
        for line in process.stdout:
            sys.stdout.write(line)
            log.write(line)
        for line in process.stderr:
            sys.stderr.write(line)
            log.write(line)

        process.wait()

        if process.returncode == 0:
            msg = f"â Run {i} completed successfully.\n"
        else:
            msg = f"â ï¸ Run {i} failed with exit code {process.returncode}. Skipping...\n"

        print(msg, flush=True)
        log.write(msg)
        log.flush()  # ensure immediate write for CI visibility

        time.sleep(1)

    footer = "\nð All runs completed.\n"
    print(footer, flush=True)
    log.wri
