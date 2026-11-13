import os

from flask import Flask, jsonify
from sqlalchemy import event
from sqlalchemy.engine import Engine
from werkzeug.exceptions import HTTPException

from app.extensions import db


@event.listens_for(Engine, "connect")
def _sqlite_pragmas(dbapi_conn, _record):
    # Enforce FKs (project delete -> SET NULL) and use WAL for safer concurrent access.
    if dbapi_conn.__class__.__module__.startswith("sqlite3"):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.close()


def create_app(config=None):
    app = Flask(__name__)

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
    default_db = "sqlite:///" + os.path.join(base_dir, "data", "tasks.db").replace("\\", "/")
    app.config.update(
        SQLALCHEMY_DATABASE_URI=os.environ.get("DATABASE_URL", default_db),
        JSON_SORT_KEYS=False,
        MAX_CONTENT_LENGTH=1024 * 1024,
    )
    if config:
        app.config.update(config)

    uri = app.config["SQLALCHEMY_DATABASE_URI"]
    if uri.startswith("sqlite:///") and ":memory:" not in uri:
        os.makedirs(os.path.dirname(uri[len("sqlite:///"):]) or ".", exist_ok=True)

    db.init_app(app)

    from app.routes.api import api
    from app.routes.views import views

    app.register_blueprint(api, url_prefix="/api")
    app.register_blueprint(views)

    @app.errorhandler(HTTPException)
    def _http_error(err):
        return jsonify(error=err.name, message=err.description), err.code

    @app.errorhandler(Exception)
    def _unhandled(err):
        app.logger.exception("Unhandled error")
        db.session.rollback()
        return jsonify(error="Internal Server Error", message="Something went wrong."), 500

    with app.app_context():
        from app import models  # noqa: F401

        db.create_all()

    return app
