import re
from datetime import date

from flask import Blueprint, jsonify, request
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import PRIORITIES, STATUSES, Project, Task

api = Blueprint("api", __name__)

COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class ValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors


@api.errorhandler(ValidationError)
def _validation_error(err):
    return jsonify(error="Validation Error", message="Invalid input.", details=err.errors), 400


def _json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValidationError({"body": "Request body must be a JSON object."})
    return data


def _clean_task(data, partial=False):
    """Validate task payload; return dict of cleaned fields."""
    errors, out = {}, {}

    if "title" in data or not partial:
        title = data.get("title")
        if not isinstance(title, str) or not title.strip():
            errors["title"] = "Title is required."
        elif len(title.strip()) > 120:
            errors["title"] = "Title must be at most 120 characters."
        else:
            out["title"] = title.strip()

    if "description" in data:
        desc = data["description"] or ""
        if not isinstance(desc, str) or len(desc) > 2000:
            errors["description"] = "Description must be text up to 2000 characters."
        else:
            out["description"] = desc.strip()

    for field, allowed in (("priority", PRIORITIES), ("status", STATUSES)):
        if field in data:
            if data[field] not in allowed:
                errors[field] = f"{field.capitalize()} must be one of: {', '.join(allowed)}."
            else:
                out[field] = data[field]

    if "due_date" in data:
        raw = data["due_date"]
        if raw in (None, ""):
            out["due_date"] = None
        else:
            try:
                if not isinstance(raw, str):
                    raise ValueError
                out["due_date"] = date.fromisoformat(raw)
            except ValueError:
                errors["due_date"] = "Due date must be a valid date in YYYY-MM-DD format."

    if "project_id" in data:
        pid = data["project_id"]
        if pid in (None, ""):
            out["project_id"] = None
        elif isinstance(pid, bool) or not isinstance(pid, int):
            errors["project_id"] = "Project id must be an integer."
        elif db.session.get(Project, pid) is None:
            errors["project_id"] = "Project does not exist."
        else:
            out["project_id"] = pid

    if errors:
        raise ValidationError(errors)
    return out


def _clean_project(data):
    errors, out = {}, {}
    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        errors["name"] = "Name is required."
    elif len(name.strip()) > 80:
        errors["name"] = "Name must be at most 80 characters."
    else:
        out["name"] = name.strip()

    desc = data.get("description") or ""
    if not isinstance(desc, str) or len(desc) > 255:
        errors["description"] = "Description must be text up to 255 characters."
    else:
        out["description"] = desc.strip()

    color = data.get("color")
    if color is not None:
        if not isinstance(color, str) or not COLOR_RE.match(color):
            errors["color"] = "Color must be a hex value like #3b82f6."
        else:
            out["color"] = color.lower()

    if errors:
        raise ValidationError(errors)
    return out


def _not_found(what):
    return jsonify(error="Not Found", message=f"{what} not found."), 404


# ---------- health ----------
@api.get("/health")
def health():
    db.session.execute(db.text("SELECT 1"))
    return jsonify(status="ok")


# ---------- tasks ----------
@api.get("/tasks")
def list_tasks():
    q = Task.query
    status = request.args.get("status")
    priority = request.args.get("priority")
    project_id = request.args.get("project_id")
    search = (request.args.get("q") or "").strip()

    errors = {}
    if status:
        if status not in STATUSES:
            errors["status"] = f"Must be one of: {', '.join(STATUSES)}."
        else:
            q = q.filter(Task.status == status)
    if priority:
        if priority not in PRIORITIES:
            errors["priority"] = f"Must be one of: {', '.join(PRIORITIES)}."
        else:
            q = q.filter(Task.priority == priority)
    if project_id:
        if project_id == "none":
            q = q.filter(Task.project_id.is_(None))
        elif project_id.isdigit():
            q = q.filter(Task.project_id == int(project_id))
        else:
            errors["project_id"] = "Must be an integer or 'none'."
    if errors:
        raise ValidationError(errors)
    if search:
        like = f"%{search}%"
        q = q.filter(Task.title.ilike(like) | Task.description.ilike(like))

    tasks = q.order_by(Task.due_date.is_(None), Task.due_date, Task.id.desc()).all()
    return jsonify([t.to_dict() for t in tasks])


@api.post("/tasks")
def create_task():
    task = Task(**_clean_task(_json_body()))
    db.session.add(task)
    db.session.commit()
    return jsonify(task.to_dict()), 201


@api.get("/tasks/<int:task_id>")
def get_task(task_id):
    task = db.session.get(Task, task_id)
    return jsonify(task.to_dict()) if task else _not_found("Task")


@api.put("/tasks/<int:task_id>")
def update_task(task_id):
    task = db.session.get(Task, task_id)
    if not task:
        return _not_found("Task")
    for key, value in _clean_task(_json_body(), partial=True).items():
        setattr(task, key, value)
    db.session.commit()
    return jsonify(task.to_dict())


@api.delete("/tasks/<int:task_id>")
def delete_task(task_id):
    task = db.session.get(Task, task_id)
    if not task:
        return _not_found("Task")
    db.session.delete(task)
    db.session.commit()
    return "", 204


# ---------- projects ----------
@api.get("/projects")
def list_projects():
    return jsonify([p.to_dict() for p in Project.query.order_by(Project.name).all()])


@api.post("/projects")
def create_project():
    project = Project(**_clean_project(_json_body()))
    db.session.add(project)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        raise ValidationError({"name": "A project with this name already exists."})
    return jsonify(project.to_dict()), 201


@api.delete("/projects/<int:project_id>")
def delete_project(project_id):
    project = db.session.get(Project, project_id)
    if not project:
        return _not_found("Project")
    db.session.delete(project)  # tasks keep existing, project_id -> NULL
    db.session.commit()
    return "", 204


# ---------- dashboard ----------
@api.get("/dashboard/stats")
def dashboard_stats():
    today = date.today()
    total = db.session.query(func.count(Task.id)).scalar()
    by_status = dict(db.session.query(Task.status, func.count(Task.id)).group_by(Task.status).all())
    completed = by_status.get("completed", 0)
    open_tasks = Task.status != "completed"

    due_today = Task.query.filter(Task.due_date == today, open_tasks).count()
    overdue = Task.query.filter(Task.due_date < today, open_tasks).count()

    projects = Project.query.order_by(Project.name).all()
    # A project is active unless it has tasks and every one of them is completed.
    active = [p for p in projects if not p.tasks or any(t.status != "completed" for t in p.tasks)]

    recent = Task.query.order_by(Task.created_at.desc(), Task.id.desc()).limit(5).all()
    return jsonify(
        total_tasks=total,
        completed_tasks=completed,
        completion_rate=round(completed * 100 / total) if total else 0,
        due_today=due_today,
        overdue=overdue,
        active_projects=len(active),
        by_status={s: by_status.get(s, 0) for s in STATUSES},
        recent_tasks=[t.to_dict() for t in recent],
        projects=[p.to_dict() for p in active],
    )
