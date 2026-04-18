"""
Docker Log Monitor Service
===========================
A background service that continuously scans all Docker container logs
for ERROR, CRITICAL, EXCEPTION, and TRACEBACK patterns.

WARNINGs are intentionally suppressed from the system monitor and Telegram
alerts because they are mostly harmless operational noise (retries, successful
news fetches logged at WARNING level, rate-limit pauses that resolve on their
own, etc.).  Only genuine errors that need human intervention are surfaced.

When a real problem is detected, it:
1. Deduplicates using Redis (5-minute cooldown per unique error)
2. Sends a beautifully formatted Telegram alert to ALL users
   who have notifications enabled in their settings

Architecture:
  Celery Task (every 60s) → fetch last 60s of logs from each container
                           → regex pattern match  (WARNING suppressed)
                           → Redis dedup check
                           → Telegram notify (ERROR / CRITICAL only)
"""

import re
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ============================================================
# PATTERN DEFINITIONS
# ============================================================

# Patterns that indicate a CRITICAL error (red alert 🔴)
CRITICAL_PATTERNS = [
    re.compile(r'\bCRITICAL\b', re.IGNORECASE),
    re.compile(r'\bFATAL\b', re.IGNORECASE),
    re.compile(r'Traceback \(most recent call last\)', re.IGNORECASE),
    re.compile(r'\bSystemExit\b', re.IGNORECASE),
    re.compile(r'\bSegmentation fault\b', re.IGNORECASE),
    re.compile(r'\bOOM\b'),  # Out of Memory
    re.compile(r'killed by signal', re.IGNORECASE),
]

# Patterns that indicate an ERROR (orange alert 🟠)
ERROR_PATTERNS = [
    re.compile(r'\bERROR\b', re.IGNORECASE),
    re.compile(r'\bException\b'),
    re.compile(r'\bError:\b'),
    re.compile(r'sqlalchemy\.exc\.', re.IGNORECASE),
    re.compile(r'ConnectionRefusedError', re.IGNORECASE),
    re.compile(r'OperationalError', re.IGNORECASE),
    re.compile(r'IntegrityError', re.IGNORECASE),
    re.compile(r'500 Internal Server Error', re.IGNORECASE),
    re.compile(r'502 Bad Gateway', re.IGNORECASE),
    re.compile(r'503 Service Unavailable', re.IGNORECASE),
    re.compile(r'504 Gateway Timeout', re.IGNORECASE),
    re.compile(r'\bHTTP 5\d{2}\b'), # Any 5xx error
    re.compile(r'celery\.exceptions', re.IGNORECASE),
    re.compile(r'Worker exited', re.IGNORECASE),
    re.compile(r'Connection refused', re.IGNORECASE),
    re.compile(r'\bFailed\b', re.IGNORECASE),
    re.compile(r'API Error', re.IGNORECASE),
]

# Patterns that indicate a WARNING (yellow alert 🟡)
# NOTE: WARNINGs are classified internally for colour-coding in the live log
# terminal, but they are NOT sent to Telegram and NOT published to the
# system-monitor alert widget.  Only ERROR / CRITICAL go there.
WARNING_PATTERNS = [
    re.compile(r'\bWARNING\b', re.IGNORECASE),
    re.compile(r'\bWARN\b'),
    re.compile(r'\bDeprecation\b', re.IGNORECASE),
    re.compile(r'\bRetrying\b', re.IGNORECASE),
    re.compile(r'\bTimeout\b', re.IGNORECASE),
    re.compile(r'\bretry\b', re.IGNORECASE),
    re.compile(r'rate.?limit', re.IGNORECASE),
    re.compile(r'\bSlow query\b', re.IGNORECASE),
    re.compile(r'404 Not Found', re.IGNORECASE),
    re.compile(r'403 Forbidden', re.IGNORECASE),
    re.compile(r'401 Unauthorized', re.IGNORECASE),
    re.compile(r'\bHTTP 4\d{2}\b'), # Any 4xx error (as warning)
]

# ── Harmless WARNING-level noise to demote to INFO ──────────────────────────
# These are messages that Python/Celery logs at WARNING level but are actually
# successful or routine operations — they must NOT appear in the system monitor
# or trigger Telegram alerts.
NOISE_WARNING_PATTERNS = [
    # Successful market data / news fetches reported at WARNING by some tasks.
    # ⚠ Bug #6 fix: patterns were too broad — "Fetch Completed" / "executed successfully"
    # could silently suppress real error messages that happened to contain those words.
    # Now anchored to specific known-benign prefixes only.
    re.compile(r'Market(?:\s+News)?\s+Fetch\s+Completed', re.IGNORECASE),
    re.compile(r'News\s+fetch\s+executed\s+successfully', re.IGNORECASE),
    re.compile(r'\bFetch\s+Completed\.?\s*\d*\s*new\s+items', re.IGNORECASE),  # "Fetch Completed. N new items."
    re.compile(r'items fetched', re.IGNORECASE),
    # Celery task success noise
    re.compile(r'Task succeeded in', re.IGNORECASE),
    re.compile(r'new items\.?\s*$', re.IGNORECASE),   # "3 new items."
    # Routine rate-limit pauses that self-heal
    re.compile(r'sleeping for \d+ second', re.IGNORECASE),
    re.compile(r'backing off', re.IGNORECASE),
    # Scheduled-task heartbeat noise
    re.compile(r'beat: Waking up', re.IGNORECASE),
    re.compile(r'Scheduler: Sending due task', re.IGNORECASE),
]

# Lines to IGNORE (avoid spam from known-harmless patterns)
IGNORE_PATTERNS = [
    re.compile(r'GET /api/v1/health', re.IGNORECASE),
    re.compile(r'200 OK'),
    re.compile(r'INFO:'),
    re.compile(r'^\s*$'),
    re.compile(r'Celery beat v'),  # startup messages
    re.compile(r'ready\. Loaded'),
    re.compile(r'mingle: searching'),
    re.compile(r'mingle: all alone'),
    re.compile(r'celery@.* ready'),
    re.compile(r'Scheduler: Sending due task'),
    re.compile(r'Task .* succeeded'),
    re.compile(r'Task .* received'),
    re.compile(r'\[LogMonitor\]'),   # prevent infinite loops from our own logging!
    # ── Telegram / notification failures ─────────────────────────────────────
    # These are WARNING-level in notification.py, not real server errors.
    # Without these, a Telegram timeout creates an alert → which logs → which
    # creates another alert → infinite loop.
    re.compile(r'\[TelegramNotify\]', re.IGNORECASE),
    re.compile(r'api\.telegram\.org', re.IGNORECASE),
    re.compile(r'Timed out sending to user', re.IGNORECASE),
    re.compile(r'Network error for user', re.IGNORECASE),
    re.compile(r'Failed to send notification to user', re.IGNORECASE),
    # ── Proxy connection issues (benign/transient/startup) ───────────────────
    re.compile(r'ended by the other party', re.IGNORECASE),
    re.compile(r'writeAfterFIN', re.IGNORECASE),
    # ── PostgreSQL / TimescaleDB controlled shutdown ──────────────────────────
    # These appear whenever the DB container is restarted via docker-compose
    # (docker stop / restart / down). They are NOT crashes — "administrator
    # command" means Postgres received a SIGTERM from Docker and shut down
    # gracefully.  The container auto-restarts via restart: always, so no
    # action is required and these must never trigger a Telegram alert.
    re.compile(r'due to administrator command', re.IGNORECASE),
    re.compile(r'terminating background worker.*TimescaleDB', re.IGNORECASE),
    re.compile(r'background worker.*exited with exit code 1', re.IGNORECASE),
    re.compile(r'logical replication launcher.*exited', re.IGNORECASE),
    re.compile(r'TimescaleDB Background Worker', re.IGNORECASE),
    re.compile(r'database system is shut down', re.IGNORECASE),
    re.compile(r'received fast shutdown request', re.IGNORECASE),
    re.compile(r'aborting any active transactions', re.IGNORECASE),
    # ⚠ Bug #4 fix: bare r'shutting down' was dangerously broad — it would silence
    # real critical alerts like "Service shutting down due to OOM" or
    # "Worker shutting down unexpectedly".  Replaced with PostgreSQL-specific
    # patterns that only match known-safe controlled-shutdown log lines.
    re.compile(r'database system is shutting down', re.IGNORECASE),
    re.compile(r'PostgreSQL.*shutting down', re.IGNORECASE),
    # ── PostgreSQL WAL crash-recovery (self-healing, no action needed) ────────
    # These 5 lines appear together whenever Postgres recovers from an unclean
    # shutdown (e.g. host reboot, OOM kill, docker kill).  PostgreSQL handles
    # this automatically via WAL replay — "redo done" confirms success.
    # The FATAL line is transient: another process tried to connect while the
    # DB was mid-recovery.  All of these are safe to ignore completely.
    re.compile(r'the database system is starting up', re.IGNORECASE),
    re.compile(r'database system was not properly shut down', re.IGNORECASE),
    re.compile(r'automatic recovery in progress', re.IGNORECASE),
    re.compile(r'redo starts at', re.IGNORECASE),
    re.compile(r'redo done at', re.IGNORECASE),
    re.compile(r'invalid record length at.*expected at least.*got 0', re.IGNORECASE),
    # ── Frontend / Node.js Dev Server Noise (EPIPE / Broken Pipe) ────────────
    # These happen when a browser tab is closed or refreshed mid-transfer.
    re.compile(r'Error: write EPIPE', re.IGNORECASE),
    re.compile(r'Error: read ECONNRESET', re.IGNORECASE),
    re.compile(r'Broken pipe', re.IGNORECASE),
    re.compile(r'node:internal/stream_base_commons', re.IGNORECASE),
]

# Patterns that look like errors but should be downgraded to WARNING
# These are transient network events that do NOT require human intervention.
WARNING_OVERRIDE_PATTERNS = [
    re.compile(r'\[vite\].*proxy error', re.IGNORECASE),
    re.compile(r'TCPConnectWrap\.afterConnect', re.IGNORECASE),
    re.compile(r'\[proxy\] Backend connection issue', re.IGNORECASE),
    re.compile(r'ECONNREFUSED', re.IGNORECASE),
    # ── Frontend / Node.js transient network resets ───────────────────────────
    # ECONNRESET = client (browser/tab) closed the connection abruptly.
    # This is normal behaviour — page refresh, tab close, network hiccup.
    # The frontend server recovers automatically; no action needed.
    re.compile(r'ECONNRESET', re.IGNORECASE),
    re.compile(r'read ECONNRESET', re.IGNORECASE),
    re.compile(r'TCP\.onStreamRead', re.IGNORECASE),
]

# Container names to monitor (must match docker-compose container_name)
CONTAINERS_TO_MONITOR = [
    "cosmoquant_backend",
    "cosmo_celery_worker",
    "cosmo_celery_beat",
    "cosmoquant_redis",
    "cosmoquant_db",
    "cosmoquant_frontend",
]

# Redis cooldown: same error won't trigger alert for N seconds
ALERT_COOLDOWN_SECONDS = 300  # 5 minutes

# How many lines of logs to fetch per container per run
LOG_TAIL_LINES = 100

# Redis key that stores the last scan timestamp (to use with docker logs --since)
LAST_SCAN_KEY = "log_monitor:last_scan_ts"


# ============================================================
# SEVERITY CLASSIFICATION
# ============================================================

def classify_log_line(line: str) -> Optional[str]:
    """
    Classify a log line by severity.
    Returns: 'CRITICAL', 'ERROR', 'WARNING', or None (if not an alert)

    'WARNING' is returned for the live-terminal colour-coding only.
    The alert pipeline (system monitor widget + Telegram) skips WARNING entirely
    — see scan_docker_logs_and_notify().
    """
    # Skip boring / harmless lines first (fast path)
    for pattern in IGNORE_PATTERNS:
        if pattern.search(line):
            return None

    # Demote known-harmless WARNING-level noise to INFO (return None)
    # e.g. "Market News Fetch Completed. 3 new items." logged at WARNING level
    for pattern in NOISE_WARNING_PATTERNS:
        if pattern.search(line):
            return None

    # Downgrade known benign errors to warnings immediately
    for pattern in WARNING_OVERRIDE_PATTERNS:
        if pattern.search(line):
            return 'WARNING'

    for pattern in CRITICAL_PATTERNS:
        if pattern.search(line):
            return 'CRITICAL'

    for pattern in ERROR_PATTERNS:
        if pattern.search(line):
            return 'ERROR'

    for pattern in WARNING_PATTERNS:
        if pattern.search(line):
            return 'WARNING'

    return None


def make_fingerprint(container: str, line: str) -> str:
    """
    Create a stable fingerprint for deduplication.
    Strips timestamps and dynamic values to group similar errors together.
    """
    # Remove timestamps like [2026-04-03 12:34:56] or 2026-04-03T12:34:56
    cleaned = re.sub(
        r'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?',
        '',
        line
    )
    # Remove task IDs like [abc123-def456]
    cleaned = re.sub(r'\[[0-9a-f-]{8,}\]', '', cleaned, flags=re.IGNORECASE)
    # Remove memory addresses like 0x7f3a2b
    cleaned = re.sub(r'0x[0-9a-f]+', '', cleaned, flags=re.IGNORECASE)
    # Trim and lowercase
    cleaned = cleaned.strip().lower()[:120]
    return f"log_alert:{container}:{cleaned}"


# ============================================================
# TELEGRAM MESSAGE FORMATTER
# ============================================================

def format_alert_message(
    container: str,
    severity: str,
    log_lines: list[str],
    now_utc: datetime
) -> str:
    """Build a clean, readable Telegram message (plain text, no MarkdownV2 escaping needed)."""

    severity_icons = {
        'CRITICAL': '🔴 CRITICAL',
        'ERROR':    '🟠 ERROR',
        'WARNING':  '🟡 WARNING',
    }

    # Format container name nicely
    display_name = container.replace('cosmoquant_', '').replace('cosmo_', '').replace('_', ' ').upper()

    icon_label = severity_icons.get(severity, '⚪ UNKNOWN')
    time_str = now_utc.strftime('%Y-%m-%d %H:%M:%S UTC')

    # Take up to 5 most relevant lines
    snippet_lines = [l.strip() for l in log_lines if l.strip()][:5]
    snippet = '\n'.join(snippet_lines)

    message = (
        f"🚨 CosmoQuantAI — Server Alert\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"📦 Container: {display_name}\n"
        f"⏰ Time: {time_str}\n"
        f"⚠️ Level: {icon_label}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"📋 Log:\n"
        f"{snippet}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"🔕 Cooldown: 5 min (duplicate alerts suppressed)\n"
        f"🤖 CosmoQuantAI Monitor"
    )
    return message


# ============================================================
# CORE SCAN FUNCTION
# ============================================================

async def scan_docker_logs_and_notify():
    """
    Main entry point called by Celery task.
    1. Connects to Docker daemon via socket
    2. Reads recent logs from each container
    3. Detects problems
    4. Sends Telegram alerts via user NotificationSettings
    """
    from app.db.session import SessionLocal
    from app.models.notification import NotificationSettings
    from app.services.notification import NotificationService
    from app.utils import get_redis_client

    try:
        import docker
    except ImportError:
        logger.error("docker package not installed. Install with: pip install docker")
        return

    redis = get_redis_client()
    now_utc = datetime.now(timezone.utc)

    # --- Connect to Docker ---
    try:
        docker_client = docker.from_env()
    except Exception as e:
        logger.error(f"[LogMonitor] Cannot connect to Docker daemon: {e}")
        return

    # --- Get all users with notifications enabled ---
    db = SessionLocal()
    try:
        active_users = db.query(NotificationSettings).filter(
            NotificationSettings.is_enabled == True,
            NotificationSettings.alert_server_errors == True,
            NotificationSettings.telegram_bot_token != None,
            NotificationSettings.telegram_chat_id != None,
        ).all()

        wants_broadcast = db.query(NotificationSettings).filter(
            NotificationSettings.broadcast_live_logs == True
        ).first()

        if not active_users and not wants_broadcast:
            logger.debug("[LogMonitor] No users with notifications enabled and no one wants live broadcast, skipping.")
            return

        alerts_sent = 0

        # --- Scan each container ---
        for container_name in CONTAINERS_TO_MONITOR:
            try:
                container = docker_client.containers.get(container_name)
            except docker.errors.NotFound:
                logger.debug(f"[LogMonitor] Container '{container_name}' not found, skipping.")
                continue
            except Exception as e:
                logger.warning(f"[LogMonitor] Error getting container '{container_name}': {e}")
                continue

            # Fetch logs only since the last scan (avoids re-processing old lines)
            try:
                # Retrieve the timestamp of the previous scan from Redis.
                # On first run (or after Redis flush) fall back to last 60 seconds.
                last_ts_raw = redis.get(LAST_SCAN_KEY)
                if last_ts_raw:
                    since_dt = datetime.fromisoformat(last_ts_raw.decode())
                else:
                    from datetime import timedelta
                    since_dt = now_utc - timedelta(seconds=70)  # slight overlap for safety

                raw_logs = container.logs(
                    since=since_dt,
                    stdout=True,
                    stderr=True,
                    timestamps=True,
                )
                log_text = raw_logs.decode('utf-8', errors='replace')
                log_lines = log_text.splitlines()
            except Exception as e:
                logger.warning(f"[LogMonitor] Error reading logs for '{container_name}': {e}")
                continue

            # --- Analyze lines ---
            # Process each line sequentially.  When an ERROR/CRITICAL trigger is
            # found, up to 4 continuation lines are collected as context, then the
            # outer loop advances past them so they are NOT re-evaluated as
            # independent errors — eliminating spurious duplicate alerts (Bug #3).
            i = 0
            while i < len(log_lines):
                line     = log_lines[i]
                severity = classify_log_line(line)

                # ── WARNING-only lines are silently skipped in the alert pipeline.
                # They are still colour-coded in the live terminal (publish_all_container_logs)
                # but must NOT appear in the system-monitor alert widget or Telegram.
                if severity and severity != 'WARNING':
                    # ----------------------------------------------------------
                    # Context collection: this line + up to 4 following related lines
                    # ----------------------------------------------------------
                    context_lines  = [line]
                    lines_consumed = 0  # how many following lines we absorbed

                    for j in range(1, 5):
                        if i + j >= len(log_lines):
                            break

                        next_line = log_lines[i + j]
                        next_sev  = classify_log_line(next_line)

                        # Case A — indented continuation: traceback body / stack frames.
                        # ⚠ Bug #1 fix: check the ORIGINAL line, NOT strip()-ped version.
                        #   next_line.strip().startswith(' ') is ALWAYS False because
                        #   strip() removes all leading whitespace first — dead code.
                        if next_line.startswith((' ', '\t')):
                            context_lines.append(next_line)
                            lines_consumed += 1

                        # Case B — plain informational continuation (not a new error trigger)
                        elif next_line.strip() and next_sev not in ('ERROR', 'CRITICAL'):
                            context_lines.append(next_line)
                            lines_consumed += 1

                        else:
                            # Independent new error encountered — stop collecting here;
                            # the outer while-loop handles it in the next iteration.
                            break

                    # ----------------------------------------------------------
                    # Atomic deduplication — Bug #2 fix
                    # ─────────────────────────────────────────────────────────
                    # ❌ Old (non-atomic, race-prone under concurrent workers):
                    #     if not redis.exists(key):         ← Worker-A checks: False
                    #         redis.setex(key, ttl, "1")   ← Worker-B also checked False
                    #     → both workers send the alert
                    #
                    # ✅ New (single atomic SET-if-not-exists, Redis SETNX semantics):
                    #     redis.set(key, nx=True, ex=ttl)  ← exactly ONE worker wins;
                    #     the return value tells us if we won the "slot".
                    # ----------------------------------------------------------
                    fingerprint = make_fingerprint(container_name, line)
                    was_set = redis.set(
                        fingerprint, "1",
                        nx=True,                    # SET only if key does Not eXist
                        ex=ALERT_COOLDOWN_SECONDS,  # auto-expire after cooldown window
                    )

                    if was_set:
                        # Build message
                        message = format_alert_message(
                            container=container_name,
                            severity=severity,
                            log_lines=context_lines,
                            now_utc=now_utc,
                        )

                        # --- Publish to Redis for WebSocket broadcast (system monitor widget) ---
                        # Only ERROR / CRITICAL reach this point — WARNINGs are excluded above.
                        try:
                            import json as _json
                            alert_payload = _json.dumps({
                                "type": "system_alert",
                                "severity": severity,
                                "container": container_name,
                                "display_name": container_name.replace("cosmoquant_", "").replace("cosmo_", "").replace("_", " ").upper(),
                                "message": message,
                                "snippet": context_lines[:3],
                                "timestamp": now_utc.isoformat(),
                            })
                            redis.publish("system_alerts", alert_payload)
                        except Exception as pub_err:
                            logger.warning(f"[LogMonitor] Redis publish failed: {pub_err}")

                        # Send Telegram alert to all users with notifications enabled
                        for user_settings in active_users:
                            try:
                                await NotificationService.send_message(
                                    db=db,
                                    user_id=user_settings.user_id,
                                    message=message,
                                )
                                alerts_sent += 1
                                logger.info(
                                    f"[LogMonitor] Alert sent to user {user_settings.user_id} "
                                    f"— {container_name} {severity}"
                                )
                            except Exception as e:
                                logger.error(f"[LogMonitor] Failed to notify user {user_settings.user_id}: {e}")

                    # Bug #3 fix: advance past the absorbed context lines so they are
                    # NOT re-evaluated as independent errors in subsequent iterations.
                    i += lines_consumed

                i += 1

        # Save current scan timestamp so next run only reads NEW logs
        try:
            redis.set(LAST_SCAN_KEY, now_utc.isoformat())
        except Exception as ts_err:
            logger.warning(f"[LogMonitor] Could not save scan timestamp: {ts_err}")

        if alerts_sent > 0:
            logger.info(f"[LogMonitor] Scan complete. {alerts_sent} alert(s) sent.")
        else:
            logger.debug(f"[LogMonitor] Scan complete. No new alerts.")

    except Exception as e:
        logger.error(f"[LogMonitor] Unexpected error during scan: {e}", exc_info=True)
    finally:
        db.close()
        try:
            docker_client.close()
        except Exception:
            pass


# ============================================================
# RAW LOG STREAMING (All container logs → frontend terminal)
# ============================================================

async def publish_all_container_logs():
    """
    Streams the last N lines of ALL container logs to Redis channel
    'container_logs' for live display in the frontend terminal widget.

    Called by Celery task every 10 seconds.
    Each message: { type, container, display_name, lines: [{line, level}], timestamp }
    """
    try:
        import docker
    except ImportError:
        return

    try:
        from app.utils import get_redis_client
        import json as _json
        from app.db.session import SessionLocal
        from app.models.notification import NotificationSettings

        db = SessionLocal()
        try:
            active_setting = db.query(NotificationSettings).filter(
                NotificationSettings.broadcast_live_logs == True
            ).first()
            if not active_setting:
                return False # Skip broadcasting if no user wants it
        finally:
            db.close()

        docker_client = docker.from_env()
        redis = get_redis_client()

        for container_name in CONTAINERS_TO_MONITOR:
            try:
                container = docker_client.containers.get(container_name)
            except Exception:
                continue

            try:
                raw_logs = container.logs(
                    tail=40,           # Last 40 lines per container
                    stdout=True,
                    stderr=True,
                    timestamps=True,
                )
                log_text = raw_logs.decode('utf-8', errors='replace')
                lines = [l.strip() for l in log_text.splitlines() if l.strip()]
            except Exception:
                continue

            if not lines:
                continue

            display_name = (
                container_name
                .replace("cosmoquant_", "")
                .replace("cosmo_", "")
                .replace("_", " ")
                .upper()
            )

            # Classify each line for color-coding on frontend
            classified = []
            for line in lines:
                sev = classify_log_line(line)
                if sev == 'CRITICAL':
                    level = 'CRITICAL'
                elif sev == 'ERROR':
                    level = 'ERROR'
                elif sev == 'WARNING':
                    level = 'WARNING'
                else:
                    level = 'INFO'

                classified.append({
                    "line": line[:350],   # Truncate very long lines
                    "level": level,
                })

            payload = _json.dumps({
                "type": "container_logs",
                "container": container_name,
                "display_name": display_name,
                "lines": classified,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            redis.publish("container_logs", payload)

        docker_client.close()
        return True

    except Exception as e:
        logger.error(f"[LogStream] Error publishing container logs: {e}")
        return False

