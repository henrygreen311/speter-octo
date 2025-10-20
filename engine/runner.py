import subprocess
import sys
import time

# Configuration
total_runs = 6
log_file = "run_log.txt"

# Keywords that indicate a failed run, even if exit code == 0
failure_indicators = [
    "Timeout waiting for feed page",
    "Error",
    "Failed",
    "Exception",
    "Traceback"
]

def contains_failure(text: str) -> bool:
    return any(keyword.lower() in text.lower() for keyword in failure_indicators)

with open(log_file, "w", encoding="utf-8") as log:
    for i in range(1, total_runs + 1):
        header = f"\n--- Running iteration {i} ---\n"
        print(header, flush=True)
        log.write(header)

        # Capture stdout + stderr
        process = subprocess.Popen(
            ["node", "main.js"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        stdout, stderr = process.communicate()
        combined_output = stdout + "\n" + stderr

        # Stream output to console and log file
        sys.stdout.write(stdout)
        sys.stderr.write(stderr)
        log.write(combined_output)
        log.flush()

        # Detect failure conditions
        failed = process.returncode != 0 or contains_failure(combined_output)

        if failed:
            msg = f"Run {i} detected an error or timeout â skipping to next.\n"
        else:
            msg = f"Run {i} completed successfully.\n"

        print(msg, flush=True)
        log.write(msg)
        log.flush()

        time.sleep(1)

    footer = "\nAll runs completed.\n"
    print(footer, flush=True)
    log.write(footer)

