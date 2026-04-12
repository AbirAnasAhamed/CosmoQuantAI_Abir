"""
Docker Log Monitor Service
===========================
A background service that continuously scans all Docker container logs
for ERROR, CRITICAL, WARNING, EXCEPTION, and TRACEBACK patterns.

When a problem is detected, it:
1. Deduplicates using Redis (5-minute cooldown per unique error)
2. Sends a beautifully formatted Telegram alert to ALL users
   who have notifications enabled in their settings

Architecture:
  Celery Task (every 60s) → fetch last 60s of logs from each container
                           → regex pattern match
                           → Redis dedup check
                           → Telegram notify (via NotificationSettings)
"""

import re
import logging
import asyncio
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
]

# Patterns that look like errors but should be downgraded to WARNING
WARNING_OVERRIDE_PATTERNS = [
    re.compile(r'\[vite\].*proxy error', re.IGNORECASE),
    re.compile(r'TCPConnectWrap\.afterConnect', re.IGNORECASE),
    re.compile(r'\[proxy\] Backend connection issue', re.IGNORECASE),
    re.compile(r'ECONNREFUSED', re.IGNORECASE),
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


# ============================================================
# SEVERITY CLASSIFICATION
# ============================================================

def classify_log_line(line: str) -> Optional[str]:
    """
    Classify a log line by severity.
    Returns: 'CRITICAL', 'ERROR', 'WARNING', or None (if not an alert)
    """
    # Skip boring lines first (fast path)
    for pattern in IGNORE_PATTERNS:
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

            # Fetch last N lines of logs (both stdout + stderr)
            try:
                raw_logs = container.logs(
                    tail=LOG_TAIL_LINES,
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
            # Group consecutive related lines (e.g., Traceback + exception body)
            i = 0
            while i < len(log_lines):
                line = log_lines[i]
                severity = classify_log_line(line)

                if severity:
                    # Collect context: this line + up to 4 following lines
                    context_lines = [line]
                    for j in range(1, 5):
                        if i + j < len(log_lines):
                            next_line = log_lines[i + j]
                            # Include continuation lines (indented, or part of traceback)
                            if next_line.strip() and not classify_log_line(next_line) in ('ERROR', 'CRITICAL', 'WARNING'):
                                context_lines.append(next_line)
                            elif next_line.strip().startswith(' ') or next_line.strip().startswith('\t'):
                                context_lines.append(next_line)
                    
                    # Deduplication fingerprint
                    fingerprint = make_fingerprint(container_name, line)

                    if not redis.exists(fingerprint):
                        # Set cooldown FIRST to prevent race conditions
                        redis.setex(fingerprint, ALERT_COOLDOWN_SECONDS, "1")

                        # Build message
                        message = format_alert_message(
                            container=container_name,
                            severity=severity,
                            log_lines=context_lines,
                            now_utc=now_utc,
                        )

                        # --- Publish to Redis for WebSocket broadcast (live frontend widget) ---
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

                        # Send to ALL users with notifications enabled (Only for Errors and Critical bugs)
                        if severity in ('ERROR', 'CRITICAL'):
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

                i += 1

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

