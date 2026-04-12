import subprocess
with open("backend_all_logs.txt", "w", encoding="utf-8") as f:
    process = subprocess.Popen(["docker", "logs", "cosmoquant_backend"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8")
    for line in process.stdout:
        f.write(line)
