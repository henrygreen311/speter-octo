import subprocess
import time
import sys

total_runs = 6
current_run = 0

print(f"Starting batch runner â executing creator.js {total_runs} times.\n")

while current_run < total_runs:
    current_run += 1
    print(f"\n--- Run {current_run} of {total_runs} starting ---", flush=True)
    start_time = time.time()

    try:
        process = subprocess.Popen(
            ["node", "creator.js"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        for line in process.stdout:
            sys.stdout.write(line)
        for line in process.stderr:
            sys.stderr.write(line)

        process.wait(timeout=10 * 60)  # 10-minute safeguard
        duration = round(time.time() - start_time, 2)

        if process.returncode == 0:
            print(f"Run {current_run} completed successfully in {duration}s.", flush=True)
        else:
            print(f"Run {current_run} failed (exit code {process.returncode}). Continuing.", flush=True)

    except subprocess.TimeoutExpired:
        print(f"Run {current_run} timed out after 10 minutes. Skipping.", flush=True)
        process.kill()

    except Exception as e:
        print(f"Unexpected error during run {current_run}: {e}", flush=True)

    time.sleep(2)  # delay between runs

print(f"\nAll {total_runs} runs completed.", flush=Tru
