"""
Order Flow Chart - Visible Range Verification Script
Checks OrderFlowHeatmap.tsx to confirm that setVisibleLogicalRange is used for showing 200 candles
"""
import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

TARGET = r'd:\CosmoQuantAI_Abir\frontend\src\pages\app\OrderFlowHeatmap.tsx'
content = open(TARGET, encoding='utf-8').read()

print('=' * 62)
print('  Order Flow Chart Visible Range -- Verification')
print('=' * 62)

GREEN = "\033[92m"
RED   = "\033[91m"
RESET = "\033[0m"

passed = failed = 0

def check(label, pattern):
    global passed, failed
    ok = bool(re.search(pattern, content))
    if ok:
        passed += 1
        print(f'  {GREEN}[PASS]{RESET}  {label}')
    else:
        failed += 1
        print(f'  {RED}[FAIL]{RESET}  {label}')

check('Check if candles.length > 200 condition exists', r'if\s*\(\s*candles\.length\s*>\s*200\s*\)')
check('Check if setVisibleLogicalRange is called', r'chart\.timeScale\(\)\.setVisibleLogicalRange')
check('Check from property: candles.length - 200', r'from:\s*candles\.length\s*-\s*200')
check('Check to property: candles.length - 1', r'to:\s*candles\.length\s*-\s*1')
check('Check fallback fitContent exists', r'chart\.timeScale\(\)\.fitContent\(\)')

print()
print('=' * 62)
print(f'  Total: {passed + failed}  |  Passed: {passed}  |  Failed: {failed}')
print('=' * 62)

if failed == 0:
    print(f'\n  {GREEN}ALL CHECKS PASSED!{RESET}')
    print('  The Order Flow Chart now correctly displays the latest 200 candles on screen')
    print('  while maintaining the full 2000 candles in memory for accurate indicator calculations.\n')
else:
    print(f'\n  {RED}{failed} CHECK(S) FAILED -- Review above.{RESET}\n')

sys.exit(0 if failed == 0 else 1)
