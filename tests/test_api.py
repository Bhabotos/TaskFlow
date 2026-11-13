from datetime import date, timedelta


def make_task(client, **overrides):
    payload = {"title": "Write docs", "priority": "high", **overrides}
    res = client.post("/api/tasks", json=payload)
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.get_json() == {"status": "ok"}


def test_index_page(client):
    assert client.get("/").status_code == 200


def test_create_task(client):
    task = make_task(client, description="Draft README", due_date="2030-01-02")
    assert task["id"] > 0
    assert task["status"] == "pending"
    assert task["priority"] == "high"
    assert task["due_date"] == "2030-01-02"


def test_create_task_validation(client):
    for bad in (
        {},
        {"title": "  "},
        {"title": "x", "priority": "urgent"},
        {"title": "x", "status": "nope"},
        {"title": "x", "due_date": "13/45/2020"},
        {"title": "x", "project_id": 999},
    ):
        res = client.post("/api/tasks", json=bad)
        assert res.status_code == 400, bad
        assert "details" in res.get_json()
    assert client.post("/api/tasks", data="not json").status_code == 400


def test_list_and_filter_tasks(client):
    make_task(client, title="A", priority="low")
    make_task(client, title="B", priority="high", status="completed")
    assert len(client.get("/api/tasks").get_json()) == 2
    assert [t["title"] for t in client.get("/api/tasks?priority=high").get_json()] == ["B"]
    assert [t["title"] for t in client.get("/api/tasks?status=pending").get_json()] == ["A"]
    assert len(client.get("/api/tasks?q=a").get_json()) == 1
    assert client.get("/api/tasks?status=bogus").status_code == 400


def test_get_task_and_404(client):
    task = make_task(client)
    assert client.get(f"/api/tasks/{task['id']}").get_json()["title"] == "Write docs"
    res = client.get("/api/tasks/9999")
    assert res.status_code == 404
    assert res.get_json()["error"] == "Not Found"


def test_update_task(client):
    task = make_task(client)
    res = client.put(f"/api/tasks/{task['id']}", json={"status": "completed", "title": "Done"})
    assert res.status_code == 200
    body = res.get_json()
    assert body["status"] == "completed" and body["title"] == "Done"
    assert body["priority"] == "high"  # untouched
    assert client.put(f"/api/tasks/{task['id']}", json={"priority": "x"}).status_code == 400
    assert client.put("/api/tasks/9999", json={"title": "x"}).status_code == 404


def test_delete_task(client):
    task = make_task(client)
    assert client.delete(f"/api/tasks/{task['id']}").status_code == 204
    assert client.get(f"/api/tasks/{task['id']}").status_code == 404
    assert client.delete(f"/api/tasks/{task['id']}").status_code == 404


def test_projects(client):
    res = client.post("/api/projects", json={"name": "Website", "color": "#112233"})
    assert res.status_code == 201
    pid = res.get_json()["id"]
    assert client.post("/api/projects", json={"name": "Website"}).status_code == 400  # duplicate
    assert client.post("/api/projects", json={"name": "X", "color": "red"}).status_code == 400
    task = make_task(client, project_id=pid)
    assert task["project"]["name"] == "Website"
    projects = client.get("/api/projects").get_json()
    assert projects[0]["task_count"] == 1
    # deleting a project keeps its tasks
    assert client.delete(f"/api/projects/{pid}").status_code == 204
    assert client.get(f"/api/tasks/{task['id']}").get_json()["project_id"] is None


def test_dashboard_stats(client):
    today = date.today()
    pid = client.post("/api/projects", json={"name": "P"}).get_json()["id"]
    make_task(client, title="t1", due_date=today.isoformat(), project_id=pid)
    make_task(client, title="t2", status="completed", due_date=today.isoformat())
    make_task(client, title="t3", due_date=(today - timedelta(days=1)).isoformat())
    make_task(client, title="t4")

    stats = client.get("/api/dashboard/stats").get_json()
    assert stats["total_tasks"] == 4
    assert stats["completed_tasks"] == 1
    assert stats["completion_rate"] == 25
    assert stats["due_today"] == 1  # completed task excluded
    assert stats["overdue"] == 1
    assert stats["active_projects"] == 1
    assert stats["by_status"] == {"pending": 3, "in_progress": 0, "completed": 1}
    assert len(stats["recent_tasks"]) == 4


def test_dashboard_stats_empty(client):
    stats = client.get("/api/dashboard/stats").get_json()
    assert stats["total_tasks"] == 0 and stats["completion_rate"] == 0
