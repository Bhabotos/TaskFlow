import pytest

from app import create_app
from app.extensions import db


@pytest.fixture()
def app(tmp_path):
    app = create_app(
        {"TESTING": True, "SQLALCHEMY_DATABASE_URI": f"sqlite:///{(tmp_path / 'test.db').as_posix()}"}
    )
    yield app
    with app.app_context():
        db.session.remove()
        db.engine.dispose()


@pytest.fixture()
def client(app):
    return app.test_client()
