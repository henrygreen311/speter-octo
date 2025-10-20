import subprocess
import time

# Number of runs
total_runs = 6

for i in range(1, total_runs + 1):
    print(f"\n🔄 Running iteration {i}...")

    try:
        # Execute main.js using Node.js
        result = subprocess.run(
            ["node", "main.js"],
            check=True,
            capture_output=True,
            text=True
        )
        print(f"✅ Run {i} completed successfully.")
        print(result.stdout)

    except subprocess.CalledProcessError as e:
        print(f"⚠️ Run {i} failed. Skipping to next...")
        print(f"Error Output:\n{e.stderr.strip()}")

    except Exception as e:
        print(f"❌ Unexpected error in run {i}: {e}")
        continue

    # Optional: add a short delay between runs (e.g., 1 second)
    time.sleep(1)

print("\n🏁 All runs completed.")