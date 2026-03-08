export class InfoCard {
  constructor(container, card) {
    this.container = container;
    this.card = card;
  }

  render() {
    this.renderMarkup();
  }

  update(card) {
    this.card = card;
    this.render();
  }

  renderMarkup() {
    if (this.card.type === "weather") {
      this.container.innerHTML = `
        <h3>${escapeHtml(this.card.location || this.card.title)}</h3>
        <div class="weather-temp">${escapeHtml(this.card.temperature || "--")}</div>
        <div class="weather-condition">${escapeHtml(this.card.condition || "")}</div>
        ${this.card.advice ? `<p class="info-copy">${escapeHtml(this.card.advice)}</p>` : ""}
      `;
      return;
    }

    if (this.card.type === "recipe") {
      const ingredients = (this.card.ingredients || [])
        .map((ingredient) => `<li>${escapeHtml(ingredient)}</li>`)
        .join("");
      const steps = (this.card.steps || [])
        .map((step, index) => `<li>${index + 1}. ${escapeHtml(step)}</li>`)
        .join("");

      this.container.innerHTML = `
        <h3>${escapeHtml(this.card.title)}</h3>
        ${this.card.timeHint ? `<p class="card-meta">${escapeHtml(this.card.timeHint)}</p>` : ""}
        <div class="recipe-grid">
          <section class="recipe-block">
            <h4>Ingredients</h4>
            <ul class="ingredient-list">${ingredients}</ul>
          </section>
          <section class="recipe-block">
            <h4>Steps</h4>
            <ol class="recipe-list">${steps}</ol>
          </section>
        </div>
      `;
      return;
    }

    const bullets = (this.card.bullets || [])
      .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
      .join("");

    this.container.innerHTML = `
      <h3>${escapeHtml(this.card.title)}</h3>
      <p class="info-copy">${escapeHtml(this.card.content || "")}</p>
      ${bullets ? `<ul class="bullet-list">${bullets}</ul>` : ""}
    `;
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
