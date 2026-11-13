# TaskFlow – Mini Task Manager

A lightweight task management dashboard built with Flask, SQLite and vanilla JavaScript. It is designed to run comfortably on a 1 GB AWS EC2 instance (the container idles around 60 MB RAM).

## Features

- Create, edit, delete and complete tasks (one-click checkbox)
- Priorities (Low / Medium / High), statuses (Pending / In Progress / Completed) and due dates
- Organize tasks into projects with progress bars
- Filter by status, priority and project, plus text search
- Dashboard: total tasks, active projects, completion rate, due today, recent tasks, active projects
- Settings: display name, JSON export, clear completed tasks
- Responsive layout for desktop, tablet and mobile
- SQLite persistence in a Docker volume, health check, non-root container

## Technology stack

| Layer | Tech |
| --- | --- |
| Frontend | HTML5, CSS3, vanilla JavaScript (no build step) |
| Backend | Python 3, Flask, REST API |
| Database | SQLite via SQLAlchemy (WAL mode) |
| Serving | Gunicorn (1 worker, 4 threads), optional Nginx |
| Deployment | Docker, Docker Compose, GitHub Actions (CI) |

## Project structure

```
Mini-Task-Manager/
├── app/
│   ├── __init__.py          # app factory, error handlers, DB init
│   ├── extensions.py        # SQLAlchemy instance
│   ├── models/              # Task, Project
│   ├── routes/
│   │   ├── api.py           # REST API + validation
│   │   └── views.py         # serves the SPA
│   ├── templates/index.html
│   └── static/{css,js,images}
├── tests/                   # pytest suite
├── nginx/default.conf       # optional reverse proxy
├── .github/workflows/ci.yml
├── Dockerfile
├── docker-compose.yml
├── gunicorn.conf.py
├── wsgi.py
├── requirements.txt / requirements-dev.txt
└── .env.example
```

## Local setup

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
python wsgi.py                   # http://127.0.0.1:5000
```

The database is created automatically at `data/tasks.db` on first start. Override with `DATABASE_URL`.

## Docker setup

```bash
cp .env.example .env             # optional
docker compose up -d --build     # http://127.0.0.1:5000
docker compose logs -f web
docker compose down              # keeps data
docker compose down -v           # also deletes the data volume
```

- Data lives in the `task_data` named volume mounted at `/data`.
- The container restarts automatically (`restart: unless-stopped`) and has a health check on `/api/health`.
- The app port is published on `127.0.0.1` only. For public access, enable the bundled Nginx proxy (port 80):

```bash
docker compose --profile proxy up -d --build
```

## API

Base path `/api`. Bodies and responses are JSON. Errors look like `{"error": "...", "message": "...", "details": {...}}`.

| Method | Endpoint | Description | Success |
| --- | --- | --- | --- |
| GET | `/health` | Liveness + DB check | 200 |
| GET | `/tasks` | List tasks. Query: `status`, `priority`, `project_id` (id or `none`), `q` | 200 |
| POST | `/tasks` | Create a task | 201 |
| GET | `/tasks/<id>` | Get one task | 200 |
| PUT | `/tasks/<id>` | Partial update | 200 |
| DELETE | `/tasks/<id>` | Delete a task | 204 |
| GET | `/projects` | List projects with task counts | 200 |
| POST | `/projects` | Create a project | 201 |
| DELETE | `/projects/<id>` | Delete a project (tasks are kept, unassigned) | 204 |
| GET | `/dashboard/stats` | Totals, completion rate, due today, recent tasks, projects | 200 |

Task fields: `title` (required, ≤120), `description` (≤2000), `priority` (`low|medium|high`), `status` (`pending|in_progress|completed`), `due_date` (`YYYY-MM-DD` or null), `project_id` (integer or null).
Project fields: `name` (required, unique, ≤80), `description` (≤255), `color` (`#rrggbb`).

Status codes: `400` validation error, `404` not found, `413` body too large, `500` unexpected error.

```bash
curl -X POST http://127.0.0.1:5000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Ship it","priority":"high","due_date":"2030-01-31"}'
```

"Due today" and "overdue" use the server date; set `TZ` in `.env` to match your timezone.

## Testing

```bash
pip install -r requirements-dev.txt
python -m pytest -v
```

Tests use a temporary SQLite database and cover health, task CRUD, validation, projects and dashboard statistics.

## CI

`.github/workflows/ci.yml` runs on pushes and pull requests to `main`: installs dependencies, runs pytest, builds the Docker image, smoke-tests the container, and reports the result. It does not deploy anything.

## Future AWS deployment architecture (planned, not configured)

```
GitHub push to main
      │  GitHub Actions (CI passes)
      ▼
 OIDC role assumption ──► Amazon ECR (image push)
      │
      ▼
 AWS Systems Manager (SSM Run Command)
      ▼
 EC2 (1 GB) ── docker compose pull && up -d
      ├─ Nginx :80/:443 ──► Gunicorn/Flask :5000
      └─ Docker volume (SQLite)  ──► periodic EBS snapshot / S3 backup
```

ECR, GitHub OIDC, EC2 and SSM are intentionally not set up yet.

## Limitations

- Single-user, no authentication: put it behind a VPN/auth proxy before exposing publicly.
- SQLite supports one writer at a time, so the container runs a single Gunicorn worker. Do not scale horizontally.
- The display name is stored per-browser.
