from datetime import date, datetime, timezone

from app.extensions import db

PRIORITIES = ("low", "medium", "high")
STATUSES = ("pending", "in_progress", "completed")


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Project(db.Model):
    __tablename__ = "projects"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False, unique=True)
    description = db.Column(db.String(255), nullable=False, default="")
    color = db.Column(db.String(7), nullable=False, default="#3b82f6")
    created_at = db.Column(db.DateTime, nullable=False, default=_now)

    tasks = db.relationship("Task", back_populates="project", passive_deletes=True)

    def to_dict(self, counts=True):
        data = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "color": self.color,
            "created_at": self.created_at.isoformat(),
        }
        if counts:
            total = len(self.tasks)
            done = sum(1 for t in self.tasks if t.status == "completed")
            data.update(
                task_count=total,
                completed_count=done,
                progress=round(done * 100 / total) if total else 0,
            )
        return data


class Task(db.Model):
    __tablename__ = "tasks"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=False, default="")
    priority = db.Column(db.String(10), nullable=False, default="medium", index=True)
    status = db.Column(db.String(12), nullable=False, default="pending", index=True)
    due_date = db.Column(db.Date, nullable=True)
    project_id = db.Column(
        db.Integer, db.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at = db.Column(db.DateTime, nullable=False, default=_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=_now, onupdate=_now)

    project = db.relationship("Project", back_populates="tasks")

    @property
    def is_overdue(self):
        return bool(self.due_date and self.status != "completed" and self.due_date < date.today())

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "priority": self.priority,
            "status": self.status,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "project_id": self.project_id,
            "project": (
                {"id": self.project.id, "name": self.project.name, "color": self.project.color}
                if self.project
                else None
            ),
            "overdue": self.is_overdue,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
