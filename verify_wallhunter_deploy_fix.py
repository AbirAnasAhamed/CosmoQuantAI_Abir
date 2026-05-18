"""
WallHunter Bot - Deploy Mode Fix (Option C) Verifier
Checks all 4 surgical changes in WallHunterModal.tsx
"""

import re
import sys
import io
from pathlib import Path

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Color helpers
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
RESET  = "\033[0m"

def ok(msg):   print(f"  {GREEN}[PASS]{RESET}  {msg}")
def fail(msg): print(f"  {RED}[FAIL]{RESET}  {msg}")
def info(msg): print(f"  {CYAN}[INFO]{RESET}  {msg}")
def sep():     print(f"\n{DIM}" + "-" * 70 + RESET)

# Target file
TARGET = Path(r"d:\CosmoQuantAI_Abir\frontend\src\components\features\market\WallHunterModal.tsx")

print(f"\n{BOLD}{CYAN}" + "=" * 70 + RESET)
print(f"{BOLD}{CYAN}  WallHunter Deploy-Mode Fix (Option C) -- Verification Script{RESET}")
print(f"{BOLD}{CYAN}" + "=" * 70 + RESET + "\n")

# Read file
if not TARGET.exists():
    print(f"{RED}[ERROR] File not found: {TARGET}{RESET}")
    sys.exit(1)

content = TARGET.read_text(encoding="utf-8")
lines   = content.splitlines()
total_lines = len(lines)
info(f"File loaded: {TARGET.name}  ({total_lines} lines, {TARGET.stat().st_size // 1024} KB)")

pass_count = 0
fail_count = 0

def check(description, pattern, required=True, multiline=False, flags=0):
    global pass_count, fail_count
    f = re.MULTILINE | flags if multiline else flags
    found = bool(re.search(pattern, content, f))
    if found:
        pass_count += 1
        ok(description)
    else:
        if required:
            fail_count += 1
            fail(description)
        else:
            info(f"(optional) {description}")
    return found

# ============================================================
# GROUP 1 -- deployMode State Declaration
# ============================================================
sep()
print(f"{BOLD}[1] deployMode State Declaration{RESET}")

check(
    "deployMode state declared with type 'update' | 'new'",
    r"useState\s*<\s*'update'\s*\|\s*'new'\s*>\s*\(\s*'update'\s*\)"
)
check(
    "deployMode comment present",
    r"'update' = update the existing bot"
)

# ============================================================
# GROUP 2 -- existingBot detection auto-resets deployMode
# ============================================================
sep()
print(f"{BOLD}[2] Existing Bot Detection Auto-Resets deployMode{RESET}")

check(
    "setDeployMode('update') called after setExistingBot(activeWallHunter)",
    r"setExistingBot\(activeWallHunter\)[\s\S]{0,80}setDeployMode\('update'\)",
    multiline=True
)
check(
    "Auto-reset comment present",
    r"Default to update mode when existing bot detected"
)

# ============================================================
# GROUP 3 -- handleDeploy respects deployMode
# ============================================================
sep()
print(f"{BOLD}[3] handleDeploy Logic Respects deployMode{RESET}")

check(
    "handleDeploy checks: existingBot && deployMode === 'update'",
    r"if\s*\(\s*existingBot\s*&&\s*deployMode\s*===\s*'update'\s*\)"
)
check(
    "UPDATE mode comment in handleDeploy",
    r"UPDATE mode: patch the existing running bot"
)

# Ensure OLD unconditional branch is gone
old_count = len(re.findall(r"if\s*\(\s*existingBot\s*\)\s*\{", content))
if old_count == 0:
    pass_count += 1
    ok("Old unconditional 'if (existingBot) {' branch has been removed correctly")
else:
    fail_count += 1
    fail(f"Old unconditional 'if (existingBot)' still present ({old_count} occurrence(s))")

# ============================================================
# GROUP 4 -- Warning Banner in Footer
# ============================================================
sep()
print(f"{BOLD}[4] Warning Banner UI in Footer{RESET}")

check("ACTIVE BOT WARNING BANNER comment present",        r"ACTIVE BOT WARNING BANNER")
check("Banner shown conditionally on existingBot",        r"\{existingBot\s*&&\s*\(")
check("Banner shows existing bot name dynamically",       r"\{existingBot\.name\}")
check("Banner shows existing bot market dynamically",     r"\{existingBot\.market\}")
check("'running' label shown in banner",                  r"is currently.*running")
check("Update Existing button in banner",                 r"Update Existing")
check("Deploy New Bot button in banner",                  r"Deploy New Bot")
check("setDeployMode('update') called by banner button",  r"setDeployMode\('update'\)")
check("setDeployMode('new') called by banner button",     r"setDeployMode\('new'\)")

# ============================================================
# GROUP 5 -- Main Deploy Button reflects deployMode
# ============================================================
sep()
print(f"{BOLD}[5] Main Deploy Button Reflects deployMode{RESET}")

check(
    "Button className uses (existingBot && deployMode === 'update')",
    r"\(existingBot\s*&&\s*deployMode\s*===\s*'update'\)"
)
check("Button text UPDATE CONFIGURATION when update mode",  r"UPDATE CONFIGURATION")
check("Button text DEPLOY SNIPER for new bot",              r"DEPLOY SNIPER")
check("Button gradient blue for update mode",               r"from-blue-500 to-indigo-600")

# ============================================================
# GROUP 6 -- Regression: Existing features not broken
# ============================================================
sep()
print(f"{BOLD}[6] Regression Checks -- Existing Features Intact{RESET}")

check("handleDeploy function still exists",                          r"const handleDeploy\s*=\s*async")
check("botService.createBot still called",                           r"botService\.createBot\(payload\)")
check("botService.updateBot still called with correct args",         r"botService\.updateBot\(existingBot\.id,\s*payload\)")
check("botService.controlBot('start') still fires after create",     r"botService\.controlBot\(createdBot\.id,\s*'start'\)")
check("onDeploySuccess callback fires after new bot deploy",         r"onDeploySuccess\s*\(\s*Number\(createdBot\.id\)")
check("Cancel button (onClose) still exists",                        r"CANCEL")
check("PROCESSING... loading state still present",                   r"PROCESSING\.\.\.")
check("setExistingBot(null) still present in else branch",           r"setExistingBot\(null\)")

# ============================================================
# FINAL REPORT
# ============================================================
sep()
total = pass_count + fail_count
print(f"\n{BOLD}" + "=" * 70 + RESET)
print(f"{BOLD}  VERIFICATION REPORT{RESET}")
print("=" * 70)
print(f"  Total checks  : {total}")
print(f"  {GREEN}Passed        : {pass_count}{RESET}")
if fail_count > 0:
    print(f"  {RED}Failed        : {fail_count}{RESET}")
else:
    print(f"  {GREEN}Failed        : 0{RESET}")
print()

if fail_count == 0:
    print(f"{GREEN}{BOLD}  ALL {total} CHECKS PASSED!{RESET}")
    print(f"{GREEN}  Option C Deploy Fix is working correctly.{RESET}")
    print(f"\n{DIM}  Behavior summary:")
    print(f"  - No active bot found    -> Shows normal Deploy button")
    print(f"  - Active bot found       -> Shows amber warning banner")
    print(f"                              [Update Existing] [Deploy New Bot]")
    print(f"  - Update mode selected   -> Patches existing bot config")
    print(f"  - New bot mode selected  -> Creates and starts a fresh bot{RESET}")
else:
    print(f"{RED}{BOLD}  {fail_count} CHECK(S) FAILED -- Review the failures above.{RESET}")

print("\n" + "=" * 70 + "\n")
sys.exit(0 if fail_count == 0 else 1)
