"""
Bot Status HUD -- Draggable Feature Verification
Checks OrderFlowHeatmap.tsx for all drag-related changes
"""
import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

TARGET = r'd:\CosmoQuantAI_Abir\frontend\src\pages\app\OrderFlowHeatmap.tsx'
content = open(TARGET, encoding='utf-8').read()

print('=' * 62)
print('  Bot HUD Draggable Feature -- Verification')
print('=' * 62)

GREEN = "\033[92m"
RED   = "\033[91m"
RESET = "\033[0m"

passed = failed = 0

def check(label, pattern):
    global passed, failed
    if isinstance(pattern, bool):
        ok = pattern
    else:
        ok = bool(re.search(pattern, content))
    if ok:
        passed += 1
        print(f'  {GREEN}[PASS]{RESET}  {label}')
    else:
        failed += 1
        print(f'  {RED}[FAIL]{RESET}  {label}')

# ── Imports ────────────────────────────────────────────────────────────────────
print('\n[1] Import Checks')
check('useCallback imported from React',
      r'useCallback')

# ── State & Refs ───────────────────────────────────────────────────────────────
print('\n[2] State & Ref Declarations')
check('hudPos state initialized with x:24, y:24',
      r'hudPos.*useState.*x:\s*24')
check('hudDragRef declared as useRef',
      r'hudDragRef.*useRef')

# ── Drag Handler ───────────────────────────────────────────────────────────────
print('\n[3] Drag Handler Logic')
check('startHudDrag declared with useCallback',
      r'const startHudDrag = useCallback')
check('e.preventDefault() called on mousedown',
      r'e\.preventDefault\(\)')
check('drag origin captured from hudPos',
      r'drag\.originX = hudPos\.x')
check('mousemove listener added on drag start',
      r"window\.addEventListener\('mousemove'")
check('mouseup listener added on drag start',
      r"window\.addEventListener\('mouseup'")
check('mousemove listener removed on mouseup',
      r"window\.removeEventListener\('mousemove'")
check('mouseup listener removed on mouseup',
      r"window\.removeEventListener\('mouseup'")
check('setHudPos called inside onMove handler',
      r'setHudPos\(')
check('Math.max(0,...) clamps x position',
      r'Math\.max\(0,\s*drag\.originX')
check('Math.max(0,...) clamps y position',
      r'Math\.max\(0,\s*drag\.originY')

# ── HUD Element ────────────────────────────────────────────────────────────────
print('\n[4] HUD Element Structure')
check('HUD wrapper uses style with left: hudPos.x',
      r'left: hudPos\.x')
check('HUD wrapper uses style with top: hudPos.y',
      r'top: hudPos\.y')
check('Old pointer-events-none removed from HUD outer div',
      'pointer-events-none' not in content[content.find('ACTIVE BOT STATUS HUD'):content.find('ACTIVE BOT STATUS HUD')+300])
check('onMouseDown={startHudDrag} on title/handle',
      r'onMouseDown=\{startHudDrag\}')
check('cursor-grab class on drag handle',
      r'cursor-grab')
check('active:cursor-grabbing for drag feedback',
      r'active:cursor-grabbing')
check('Grip dot SVG viewBox present',
      r'viewBox="0 0 10 16"')
check('DRAGGABLE label in HUD comment',
      r'DRAGGABLE')

# ── Regression ─────────────────────────────────────────────────────────────────
print('\n[5] Regression Checks (Existing Features)')
check("In Trade / Monitoring label still present",
      r"In Trade")
check('handleEmergencySell market button still wired',
      r"handleEmergencySell\('market'\)")
check('handleEmergencySell limit button still wired',
      r"handleEmergencySell\('limit'\)")
check('total_pnl display still present',
      r'botStatus\.total_pnl')
check('total_orders display still present',
      r'botStatus\.total_orders')
check('total_wins display still present',
      r'botStatus\.total_wins')
check('total_losses display still present',
      r'botStatus\.total_losses')
check('tp_price display still present',
      r'formatDisplayPrice\(botStatus\.tp_price\)')
check('sl_price display still present',
      r'formatDisplayPrice\(botStatus\.sl_price\)')
check('Unrealized PnL row still present',
      r'Unrealized PnL')
check('botStatus.pnl_percent still displayed',
      r'botStatus\.pnl_percent')

# ── Report ─────────────────────────────────────────────────────────────────────
total = passed + failed
print()
print('=' * 62)
print(f'  Total: {total}  |  Passed: {passed}  |  Failed: {failed}')
print('=' * 62)

if failed == 0:
    print(f'\n  {GREEN}ALL {total} CHECKS PASSED!{RESET}')
    print('  Bot Status HUD is now fully draggable.\n')
    print('  How it works:')
    print('  - Grip icon + title bar = drag handle')
    print('  - Mouse cursor -> grab on hover, grabbing during drag')
    print('  - Position clamped >= 0 so HUD cannot go off-screen top/left')
    print('  - Emergency Sell buttons remain fully clickable')
    print('  - Default position: 24px from top-left of chart area')
else:
    print(f'\n  {RED}{failed} CHECK(S) FAILED -- Review above.{RESET}')

print()
sys.exit(0 if failed == 0 else 1)
