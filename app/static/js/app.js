(() => {
  "use strict";

  const ICONS = {
    home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    folder: '<path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  };
  const icon = (n) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LABEL = { low: "Low", medium: "Medium", high: "High", pending: "Pending", in_progress: "In Progress", completed: "Completed" };

  const state = { projects: [], filters: { q: "", status: "", priority: "", project_id: "" } };
  const view = $("#view");
  const TITLES = { dashboard: "Dashboard", tasks: "Tasks", projects: "Projects", settings: "Settings" };

  // ---------- helpers ----------
  async function api(path, opts = {}) {
    const res = await fetch("/api" + path, {
      headers: opts.body ? { "Content-Type": "application/json" } : {},
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || "Request failed");
      err.details = data.details;
      throw err;
    }
    return data;
  }

  let toastTimer;
  function toast(msg, isError) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("error", !!isError);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
  }

  const errText = (e) => (e.details ? Object.values(e.details).join(" ") : e.message);

  function confirmBox(text) {
    const d = $("#confirm-dialog");
    $("#confirm-text").textContent = text;
    return new Promise((resolve) => {
      d.returnValue = "";
      d.addEventListener("close", () => resolve(d.returnValue === "ok"), { once: true });
      d.showModal();
    });
  }

  function userName() {
    try { return localStorage.getItem("tf-name") || ""; } catch { return ""; }
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  const hydrateIcons = (root = document) =>
    $$("[data-icon]", root).forEach((el) => { el.innerHTML = icon(el.dataset.icon); });

  // ---------- fragments ----------
  function taskRow(t) {
    const done = t.status === "completed";
    return `<div class="task ${done ? "done" : ""}" data-id="${t.id}">
      <button class="check ${done ? "on" : ""}" data-act="toggle" aria-label="${done ? "Mark as pending" : "Mark as completed"}" title="${done ? "Mark as pending" : "Mark as completed"}">${icon("check")}</button>
      <div class="body">
        <div class="title">${esc(t.title)}</div>
        ${t.description ? `<div class="desc">${esc(t.description)}</div>` : ""}
        <div class="meta">
          <span class="badge p-${t.priority}">${LABEL[t.priority]}</span>
          <span class="badge s-${t.status}">${LABEL[t.status]}</span>
          ${t.due_date ? `<span class="badge ${t.overdue ? "overdue" : ""}">${icon("cal")}${fmtDate(t.due_date)}${t.overdue ? " · Overdue" : ""}</span>` : ""}
          ${t.project ? `<span class="badge"><span class="pdot" style="background:${esc(t.project.color)}"></span>${esc(t.project.name)}</span>` : ""}
        </div>
      </div>
      <div class="actions">
        <button class="icon-btn" data-act="edit" aria-label="Edit task" title="Edit">${icon("edit")}</button>
        <button class="icon-btn danger" data-act="delete" aria-label="Delete task" title="Delete">${icon("trash")}</button>
      </div>
    </div>`;
  }

  const projectOptions = (selected, withAll) =>
    (withAll ? '<option value="">All projects</option><option value="none">No project</option>' : '<option value="">No project</option>') +
    state.projects.map((p) => `<option value="${p.id}" ${String(selected) === String(p.id) ? "selected" : ""}>${esc(p.name)}</option>`).join("");

  async function loadProjects() {
    state.projects = await api("/projects");
  }

  // ---------- views ----------
  async function renderDashboard() {
    const s = await api("/dashboard/stats");
    const name = userName();
    const hour = new Date().getHours();
    const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const stat = (ico, num, lbl) =>
      `<div class="card stat"><div class="ico">${icon(ico)}</div><div><div class="num">${num}</div><div class="lbl">${lbl}</div></div></div>`;
    view.innerHTML = `
      <div class="welcome"><h2>${greet}${name ? ", " + esc(name) : ""} 👋</h2>
        <p>${s.due_today ? `You have ${s.due_today} task${s.due_today > 1 ? "s" : ""} due today.` : "Nothing due today — nice and clear."}${s.overdue ? ` ${s.overdue} overdue.` : ""}</p></div>
      <div class="stats">
        ${stat("list", s.total_tasks, "Total Tasks")}
        ${stat("folder", s.active_projects, "Active Projects")}
        ${stat("chart", s.completion_rate + "%", "Completion Rate")}
        ${stat("clock", s.due_today, "Due Today")}
      </div>
      <div class="cols">
        <section class="card"><h2>Recent Tasks <a href="#/tasks">View all</a></h2>
          <div class="task-list" id="recent">${s.recent_tasks.map(taskRow).join("") ||
            `<div class="empty">No tasks yet.<br><button class="btn btn-primary" data-act="new-task">${icon("plus")}Create your first task</button></div>`}</div>
        </section>
        <section class="card"><h2>Active Projects <a href="#/projects">Manage</a></h2>
          ${s.projects.map((p) => `<div class="mini-proj"><div class="row"><span><span class="pdot" style="background:${esc(p.color)}"></span> ${esc(p.name)}</span><span>${p.completed_count}/${p.task_count} done</span></div>
            <div class="bar"><i style="width:${p.progress}%"></i></div></div>`).join("") || '<div class="empty">No active projects.</div>'}
        </section>
      </div>`;
  }

  async function renderTasks() {
    const f = state.filters;
    view.innerHTML = `
      <div class="filters">
        <input type="search" id="f-q" placeholder="Search tasks…" value="${esc(f.q)}" aria-label="Search tasks">
        <select id="f-status" aria-label="Filter by status">
          <option value="">All statuses</option>
          ${["pending", "in_progress", "completed"].map((v) => `<option value="${v}" ${f.status === v ? "selected" : ""}>${LABEL[v]}</option>`).join("")}
        </select>
        <select id="f-priority" aria-label="Filter by priority">
          <option value="">All priorities</option>
          ${["high", "medium", "low"].map((v) => `<option value="${v}" ${f.priority === v ? "selected" : ""}>${LABEL[v]}</option>`).join("")}
        </select>
        <select id="f-project" aria-label="Filter by project">${projectOptions(f.project_id, true)}</select>
      </div>
      <section class="card"><div class="task-list" id="task-list"></div></section>`;
    await refreshTaskList();
  }

  async function refreshTaskList() {
    const params = new URLSearchParams(Object.entries(state.filters).filter(([, v]) => v));
    const tasks = await api("/tasks?" + params);
    const list = $("#task-list");
    if (!list) return;
    const filtered = Object.values(state.filters).some(Boolean);
    list.innerHTML = tasks.map(taskRow).join("") ||
      `<div class="empty">${filtered ? "No tasks match these filters." : "No tasks yet."}<br><button class="btn btn-primary" data-act="new-task">${icon("plus")}Add Task</button></div>`;
  }

  async function renderProjects() {
    await loadProjects();
    view.innerHTML = `
      <div class="filters"><button class="btn btn-primary" data-act="new-project">${icon("plus")}New Project</button></div>
      <div class="project-grid">${state.projects.map((p) => `
        <div class="card project" data-pid="${p.id}">
          <h3><span class="pdot" style="background:${esc(p.color)}"></span>${esc(p.name)}</h3>
          <p>${esc(p.description)}</p>
          <div class="bar"><i style="width:${p.progress}%"></i></div>
          <div class="proj-foot"><span>${p.completed_count} of ${p.task_count} tasks done</span>
            <span><a class="badge" href="#/tasks" data-act="view-tasks">View tasks</a>
            <button class="icon-btn danger" data-act="delete-project" aria-label="Delete project" title="Delete project">${icon("trash")}</button></span></div>
        </div>`).join("") || '<div class="card empty" style="grid-column:1/-1">No projects yet. Create one to start organizing tasks.</div>'}</div>`;
  }

  function renderSettings() {
    view.innerHTML = `
      <section class="card">
        <div class="settings-row"><div><strong>Display name</strong><small>Used in the dashboard greeting. Stored in this browser only.</small></div>
          <input id="set-name" maxlength="40" placeholder="Your name" value="${esc(userName())}"></div>
        <div class="settings-row"><div><strong>Export data</strong><small>Download all tasks and projects as a JSON file.</small></div>
          <button class="btn" data-act="export">Export JSON</button></div>
        <div class="settings-row"><div><strong>Clear completed tasks</strong><small>Permanently delete every task marked as completed.</small></div>
          <button class="btn btn-danger" data-act="clear-done">Clear completed</button></div>
      </section>`;
  }

  // ---------- router ----------
  let renderToken = 0;
  async function route() {
    const name = (location.hash.replace(/^#\/?/, "") || "dashboard").split("?")[0];
    const page = TITLES[name] ? name : "dashboard";
    $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === page));
    $("#page-title").textContent = TITLES[page];
    document.body.classList.remove("nav-open");
    const token = ++renderToken;
    try {
      if (page !== "projects") await loadProjects();
      if (token !== renderToken) return;
      await { dashboard: renderDashboard, tasks: renderTasks, projects: renderProjects, settings: renderSettings }[page]();
    } catch (e) {
      view.innerHTML = `<div class="card empty">Could not load data: ${esc(e.message)}<br><button class="btn" onclick="location.reload()">Retry</button></div>`;
    }
  }

  const refresh = () => route();

  // ---------- task dialog ----------
  const taskDlg = $("#task-dialog"), taskForm = $("#task-form");
  async function openTaskDialog(task) {
    taskForm.reset();
    $("#task-error").textContent = "";
    taskForm.dataset.id = task ? task.id : "";
    $("#task-dialog-title").textContent = task ? "Edit task" : "New task";
    taskForm.project_id.innerHTML = projectOptions(task ? task.project_id : state.filters.project_id > 0 ? state.filters.project_id : "");
    if (task) {
      for (const k of ["title", "description", "priority", "status", "due_date"]) taskForm[k].value = task[k] ?? "";
    }
    taskDlg.showModal();
    taskForm.title.focus();
  }

  taskForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = taskForm.dataset.id;
    const body = Object.fromEntries(new FormData(taskForm));
    body.project_id = body.project_id ? Number(body.project_id) : null;
    body.due_date = body.due_date || null;
    try {
      await api(id ? `/tasks/${id}` : "/tasks", { method: id ? "PUT" : "POST", body });
      taskDlg.close();
      toast(id ? "Task updated" : "Task created");
      refresh();
    } catch (err) {
      $("#task-error").textContent = errText(err);
    }
  });

  // ---------- project dialog ----------
  const projDlg = $("#project-dialog"), projForm = $("#project-form");
  projForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/projects", { method: "POST", body: Object.fromEntries(new FormData(projForm)) });
      projDlg.close();
      toast("Project created");
      refresh();
    } catch (err) {
      $("#project-error").textContent = errText(err);
    }
  });

  // close buttons + backdrop click
  $$("dialog").forEach((d) => {
    d.addEventListener("click", (e) => {
      if (e.target === d || e.target.closest("[data-close]")) d.close();
    });
  });

  // ---------- events ----------
  async function exportData() {
    const [tasks, projects] = await Promise.all([api("/tasks"), api("/projects")]);
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), projects, tasks }, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "taskflow-export.json" });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    const row = el.closest(".task");
    const id = row && row.dataset.id;
    try {
      if (act === "new-task") openTaskDialog();
      else if (act === "new-project") { projForm.reset(); $("#project-error").textContent = ""; projDlg.showModal(); projForm.name.focus(); }
      else if (act === "edit") openTaskDialog(await api(`/tasks/${id}`));
      else if (act === "toggle") {
        const done = el.classList.contains("on");
        await api(`/tasks/${id}`, { method: "PUT", body: { status: done ? "pending" : "completed" } });
        refresh();
      } else if (act === "delete") {
        if (await confirmBox("Delete this task? This cannot be undone.")) {
          await api(`/tasks/${id}`, { method: "DELETE" });
          toast("Task deleted");
          refresh();
        }
      } else if (act === "delete-project") {
        if (await confirmBox("Delete this project? Its tasks will be kept but unassigned.")) {
          await api(`/projects/${el.closest(".project").dataset.pid}`, { method: "DELETE" });
          toast("Project deleted");
          refresh();
        }
      } else if (act === "view-tasks") {
        state.filters = { q: "", status: "", priority: "", project_id: el.closest(".project").dataset.pid };
      } else if (act === "export") await exportData();
      else if (act === "clear-done") {
        const done = await api("/tasks?status=completed");
        if (!done.length) return toast("No completed tasks to clear");
        if (await confirmBox(`Delete ${done.length} completed task${done.length > 1 ? "s" : ""}?`)) {
          await Promise.all(done.map((t) => api(`/tasks/${t.id}`, { method: "DELETE" })));
          toast("Completed tasks cleared");
        }
      }
    } catch (err) {
      toast(errText(err), true);
    }
  });

  let searchTimer;
  document.addEventListener("input", (e) => {
    if (e.target.id === "f-q") {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.filters.q = e.target.value.trim(); refreshTaskList(); }, 250);
    } else if (e.target.id === "set-name") {
      try { localStorage.setItem("tf-name", e.target.value.trim()); } catch { /* storage unavailable */ }
    }
  });
  document.addEventListener("change", (e) => {
    const map = { "f-status": "status", "f-priority": "priority", "f-project": "project_id" };
    if (map[e.target.id]) { state.filters[map[e.target.id]] = e.target.value; refreshTaskList(); }
  });

  $("#add-task-btn").addEventListener("click", () => openTaskDialog());
  $("#menu-btn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
  $("#scrim").addEventListener("click", () => document.body.classList.remove("nav-open"));
  window.addEventListener("hashchange", route);

  async function checkHealth() {
    const dot = $(".sidebar-foot .dot"), label = $("#health-label");
    try {
      await api("/health");
      dot.className = "dot ok"; label.textContent = "API online";
    } catch {
      dot.className = "dot bad"; label.textContent = "API offline";
    }
  }

  hydrateIcons();
  checkHealth();
  setInterval(checkHealth, 30000);
  route();
})();
