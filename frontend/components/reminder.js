export class ReminderCard {
  constructor(container, card) {
    this.container = container;
    this.card = card;
  }

  render() {
    this.renderMarkup();
    this.bindEvents();
  }

  update(card) {
    this.card = card;
    this.render();
  }

  renderMarkup() {
    this.container.innerHTML = `
      <h3>${escapeHtml(this.card.title)}</h3>
      <p class="card-meta">${escapeHtml(this.card.time || "Later")}</p>
      <p class="info-copy">${escapeHtml(this.card.text || "")}</p>
      <div class="card-actions">
        <button class="card-button card-button--primary" data-action="notify">
          Browser Alert
        </button>
      </div>
    `;
  }

  bindEvents() {
    this.container
      .querySelector('[data-action="notify"]')
      .addEventListener("click", async () => {
        if (!("Notification" in window)) {
          window.alert("This browser does not support notifications.");
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          window.alert("Notification permission is not enabled.");
          return;
        }

        const scheduledFor = Date.parse(this.card.scheduledFor || "");
        if (!Number.isNaN(scheduledFor) && scheduledFor > Date.now()) {
          const delay = scheduledFor - Date.now();
          window.setTimeout(() => {
            new Notification(this.card.title || "Reminder", {
              body: this.card.text || this.card.time || "It's time.",
            });
          }, delay);
          window.alert("A local reminder has been scheduled in this tab.");
          return;
        }

        new Notification(this.card.title || "Reminder", {
          body: this.card.text || this.card.time || "Don't forget this task.",
        });
      });
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character];
  });
}
