FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DATABASE_URL=sqlite:////data/tasks.db

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

# Non-root user; /data is the persistent SQLite location (mounted as a volume).
RUN useradd --system --uid 10001 --no-create-home appuser \
    && mkdir /data && chown appuser:appuser /data

COPY --chown=appuser:appuser app ./app
COPY --chown=appuser:appuser wsgi.py gunicorn.conf.py ./

USER appuser
VOLUME /data
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5000/api/health', timeout=4).status == 200 else 1)"

CMD ["gunicorn", "-c", "gunicorn.conf.py", "wsgi:app"]
