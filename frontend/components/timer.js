export class TimerCard {
  constructor(container, card) {
    this.container = container;
    this.card = card;
    this.durationMs = Math.max(1, Number(card.minutes || 1)) * 60 * 1000;
    this.remainingMs = this.durationMs;
    this.running = Boolean(card.autoStart);
    this.deadline = this.running ? Date.now() + this.remainingMs : null;
    this.intervalId = null;
  }

  render() {
    this.renderMarkup();
    this.bindEvents();
    this.startTicker();
  }

  update(card) {
    this.card = card;
    this.durationMs = Math.max(1, Number(card.minutes || 1)) * 60 * 1000;
    if (!this.running) {
      this.remainingMs = this.durationMs;
    }
    this.renderMarkup();
    this.bindEvents();
  }

  renderMarkup() {
    this.container.innerHTML = `
      <h3>${escapeHtml(this.card.title)}</h3>
      <p class="card-meta">${escapeHtml(this.card.label || "Running timer")}</p>
      <div class="timer-display">${formatTime(this.getRemainingMs())}</div>
      <div class="card-actions">
        <button class="card-button card-button--primary" data-action="toggle">
          ${this.running ? "Pause" : "Start"}
        </button>
        <button class="card-button" data-action="reset">Reset</button>
      </div>
    `;
  }

  bindEvents() {
    this.container
      .querySelector('[data-action="toggle"]')
      .addEventListener("click", () => {
        if (this.running) {
          this.pause();
        } else {
          this.start();
        }
      });

    this.container
      .querySelector('[data-action="reset"]')
      .addEventListener("click", () => {
        this.reset();
      });
  }

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.deadline = Date.now() + this.remainingMs;
    this.renderMarkup();
    this.bindEvents();
    this.startTicker();
  }

  pause() {
    this.remainingMs = this.getRemainingMs();
    this.running = false;
    this.deadline = null;
    this.renderMarkup();
    this.bindEvents();
    this.stopTicker();
  }

  reset() {
    this.remainingMs = this.durationMs;
    this.deadline = this.running ? Date.now() + this.durationMs : null;
    this.renderMarkup();
    this.bindEvents();
  }

  getRemainingMs() {
    if (!this.running || !this.deadline) {
      return this.remainingMs;
    }
    return Math.max(0, this.deadline - Date.now());
  }

  startTicker() {
    this.stopTicker();
    this.intervalId = window.setInterval(() => {
      const display = this.container.querySelector(".timer-display");
      if (!display) {
        return;
      }
      const remaining = this.getRemainingMs();
      display.textContent = formatTime(remaining);
      if (remaining <= 0) {
        this.running = false;
        this.remainingMs = 0;
        this.stopTicker();
        this.renderMarkup();
        this.bindEvents();
      }
    }, 250);
  }

  stopTicker() {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

function formatTime(milliseconds) {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
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
