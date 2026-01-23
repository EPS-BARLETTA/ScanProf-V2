(function () {
  const store = window.ScanProfClassesStore;
  if (!store) return;

  let classes = [];
  let currentClass = null;

  document.addEventListener("DOMContentLoaded", () => {
    classes = store.loadClasses();
    const id = new URL(window.location.href).searchParams.get("id");
    currentClass = classes.find(cls => cls.id === id);
    if (!currentClass) {
      alert("Classe introuvable, retour à la liste.");
      window.location.href = "classes.html";
      return;
    }
    render();
    bind();
  });

  function bind() {
    document.getElementById("rename-class-btn").addEventListener("click", () => {
      const name = prompt("Nouveau nom :", currentClass.name);
      if (name == null) return;
      currentClass.name = name.trim() || currentClass.name;
      save();
      render();
    });
    document.getElementById("color-class-btn").addEventListener("click", () => {
      const color = prompt("Couleur hexadécimale (ex. #1e90ff) :", currentClass.color || "#1e90ff");
      if (color == null || !color.trim()) return;
      currentClass.color = color;
      save();
      render();
    });
    document.getElementById("delete-class-btn").addEventListener("click", () => {
      if (!confirm(`Supprimer la classe « ${currentClass.name} » ?`)) return;
      classes = classes.filter(cls => cls.id !== currentClass.id);
      store.saveClasses(classes);
      window.location.href = "classes.html";
    });
    document.getElementById("create-activity-btn").addEventListener("click", () => {
      const input = document.getElementById("new-activity-name");
      const name = input.value.trim();
      if (!name) {
        alert("Merci de nommer l'activité.");
        return;
      }
      currentClass.activities.push(store.createActivity(name));
      input.value = "";
      save();
      renderActivities();
    });
  }

  function render() {
    document.getElementById("class-title").textContent = `Classe ${currentClass.name}`;
    document.getElementById("class-meta").textContent = `${currentClass.activities.length} activité(s)`;
    renderActivities();
  }

  function renderActivities() {
    const container = document.getElementById("activities-list");
    if (!currentClass.activities.length) {
      container.innerHTML = `<div class="empty-hint">Aucune activité. Créez votre première activité ci-dessous.</div>`;
      return;
    }
    container.innerHTML = currentClass.activities.map(act => `
      <article class="activity-card">
        <strong>${escapeHtml(act.name)}</strong>
        <div class="activity-meta">${act.sessions.length} séance(s)</div>
        <div class="activity-actions">
          <a class="primary" href="activity.html?class=${encodeURIComponent(currentClass.id)}&activity=${encodeURIComponent(act.id)}">Ouvrir</a>
          <button data-action="rename" data-id="${act.id}">Renommer</button>
          <button data-action="delete" data-id="${act.id}" class="danger">Supprimer</button>
        </div>
      </article>
    `).join("");
    container.querySelectorAll("button[data-action]").forEach(btn => {
      btn.addEventListener("click", () => handleAction(btn.getAttribute("data-action"), btn.getAttribute("data-id")));
    });
  }

  function handleAction(action, id) {
    const act = currentClass.activities.find(a => a.id === id);
    if (!act) return;
    if (action === "rename") {
      const name = prompt("Nouveau nom :", act.name);
      if (name == null) return;
      act.name = name.trim() || act.name;
      save();
      renderActivities();
    }
    if (action === "delete") {
      if (!confirm(`Supprimer l'activité « ${act.name} » ?`)) return;
      currentClass.activities = currentClass.activities.filter(a => a.id !== id);
      save();
      renderActivities();
    }
  }

  function save() {
    store.saveClasses(classes);
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
