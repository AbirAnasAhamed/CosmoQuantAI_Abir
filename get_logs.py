import subprocess
import re
import sys

def get_logs(service):
    try:
        out = subprocess.check_output(['docker-compose', 'logs', service, '--tail', '150'], cwd='e:\\CosmoQuantAI')
        text = out.decode('utf-8', errors='replace')
        # clean ansi
        clean = re.sub(r'\x1b\[.*?m', '', text)
        print(f"--- {service.upper()} LOGS ---")
        print(clean[-3000:])
    except Exception as e:
        print(f"Error getting {service}: {e}")

get_logs('frontend')
get_logs('backend')
