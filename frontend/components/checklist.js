export class ChecklistCard {
  constructor(container, card) {
    this.container = container;
    this.card = normalizeItems(card);
  }

  render() {
    this.renderMarkup();
    this.bindEvents();
  }

  update(card) {
    this.card = normalizeItems(card);
    this.render();
  }

  renderMarkup() {
    const items = this.card.items
      .map(
        (item, index) => `
          <li class="checklist-item ${item.checked ? "is-done" : ""}" data-index="${index}">
            <button class="check-toggle" type="button">${item.checked ? "✓" : ""}</button>
            <span class="check-label">${escapeHtml(item.label)}</span>
          </li>
        `,
      )
      .join("");

    this.container.innerHTML = `
      <h3>${escapeHtml(this.card.title)}</h3>
      ${this.card.note ? `<p class="card-meta">${escapeHtml(this.card.note)}</p>` : ""}
      <ul class="checklist-list">${items}</ul>
    `;
  }

  bindEvents() {
    this.container.querySelectorAll(".checklist-item").forEach((itemNode) => {
      itemNode.addEventListener("click", () => {
        const index = Number(itemNode.dataset.index);
        this.card.items[index].checked = !this.card.items[index].checked;
        this.render();
      });
    });
  }
}

function normalizeItems(card) {
  return {
    ...card,
    items: (card.items || []).map((item) => {
      if (typeof item === "string") {
        return { label: item, checked: false };
      }
      return { label: item.label || "", checked: Boolean(item.checked) };
    }),
  };
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

