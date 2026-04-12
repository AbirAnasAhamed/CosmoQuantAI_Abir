import logging
import os
from logging.handlers import RotatingFileHandler

def get_task_logger(logger_name: str, log_filename: str) -> logging.Logger:
    """
    Creates a logger with a RotatingFileHandler.
    
    Args:
        logger_name: Unique name for the logger.
        log_filename: Name of the log file (e.g., 'news_fetcher.log').
    
    Returns:
        Configured logger instance.
    """
    # Ensure logs directory exists
    log_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "logs")
    os.makedirs(log_dir, exist_ok=True)
    
    log_path = os.path.join(log_dir, log_filename)
    
    logger = logging.getLogger(logger_name)
    logger.setLevel(logging.INFO)
    
    # Check if handler already exists to avoid duplicate logs
    if not logger.handlers:
        # Rotating File Handler: Max 5MB, 3 Backup files
        handler = RotatingFileHandler(
            log_path, maxBytes=5 * 1024 * 1024, backupCount=3
        )
        
        formatter = logging.Formatter(
            '[%(asctime)s] [%(levelname)s] %(message)s'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        
    return logger
