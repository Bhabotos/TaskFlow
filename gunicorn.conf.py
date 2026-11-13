import os

# Tuned for a 1 GB EC2 instance: one process, a few threads. SQLite favours a single writer process.
bind = "0.0.0.0:5000"
workers = int(os.environ.get("WEB_CONCURRENCY", "1"))
threads = int(os.environ.get("GUNICORN_THREADS", "4"))
worker_class = "gthread"
timeout = 30
max_requests = 1000
max_requests_jitter = 100
accesslog = "-"
errorlog = "-"
