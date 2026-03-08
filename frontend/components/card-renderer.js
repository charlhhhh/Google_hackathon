import { ChecklistCard } from "/assets/components/checklist.js";
import { InfoCard } from "/assets/components/info-card.js";
import { ReminderCard } from "/assets/components/reminder.js";
import { TimerCard } from "/assets/components/timer.js";

const CARD_TYPES = {
  checklist: ChecklistCard,
  info: InfoCard,
  recipe: InfoCard,
  reminder: ReminderCard,
  timer: TimerCard,
  weather: InfoCard,
};

export class CardRenderer {
  constructor(container) {
    this.container = container;
    this.instances = new Map();
  }

  handleToolResponse(payload) {
    if (!payload || typeof payload !== "object") {
      return;
    }

    if (payload.action === "create" && isPanelPayload(payload)) {
      this.createPanel(payload);
      return;
    }

    if (payload.action === "update" && isPanelPayload(payload)) {
      this.updatePanel(payload);
      return;
    }

    if (payload.action === "clear" && isPanelPayload(payload)) {
      this.clearPanel(payload.id);
      return;
    }

    this.upsert(payload);
  }

  upsert(card) {
    if (!card || typeof card !== "object") {
      return;
    }

    if (card.action && isPanelPayload(card)) {
      this.handleToolResponse(card);
      return;
    }

    const normalized = normalizeCard(card);
    const existing = this.instances.get(normalized.id);

    if (existing) {
      existing.instance.update(normalized);
      return;
    }

    const CardType = CARD_TYPES[normalized.type] || InfoCard;
    const shell = document.createElement("article");
    shell.className = `card-shell card-shell--${normalized.type}`;

    const instance = new CardType(shell, normalized);
    instance.render();

    this.container.prepend(shell);
    this.instances.set(normalized.id, { kind: "card", instance, shell });
  }

  createPanel(payload) {
    const normalized = normalizePanel(payload);
    const existing = this.instances.get(normalized.id);

    if (existing?.kind === "panel") {
      existing.instance.replace(normalized);
      return;
    }

    const shell = document.createElement("article");
    shell.className = "card-shell card-shell--panel";

    const instance = new PanelCard(shell, normalized, (panelId) => {
      this.clearPanel(panelId);
    });
    instance.render();

    this.container.prepend(shell);
    this.instances.set(normalized.id, { kind: "panel", instance, shell });
  }

  updatePanel(payload) {
    const id = payload.id || payload.panelId;
    if (!id) {
      return;
    }

    const existing = this.instances.get(id);
    if (!existing || existing.kind !== "panel") {
      return;
    }

    existing.instance.applyUpdates(payload);
  }

  clearPanel(id) {
    if (!id) {
      Array.from(this.instances.entries()).forEach(([instanceId, entry]) => {
        if (entry.kind === "panel") {
          entry.instance.dispose?.();
          entry.shell.remove();
          this.instances.delete(instanceId);
        }
      });
      return;
    }

    const existing = this.instances.get(id);
    if (!existing) {
      return;
    }

    existing.instance.dispose?.();
    existing.shell.remove();
    this.instances.delete(id);
  }
}

class PanelCard {
  constructor(container, payload, onClear) {
    this.container = container;
    this.payload = normalizePanel(payload);
    this.onClear = onClear;
    this.timerStates = new Map();
    this.tickIntervalId = null;
  }

  render() {
    this.syncTimerStates();
    this.container.innerHTML = `
      <div class="vc-panel-head">
        <div>
          <p class="vc-panel-kicker">Live Task Board</p>
          <h3 class="vc-panel-title">${escapeHtml(this.payload.title)}</h3>
          ${this.payload.subtitle ? `<p class="vc-panel-subtitle">${escapeHtml(this.payload.subtitle)}</p>` : ""}
        </div>
        <button class="vc-panel-close" type="button" data-clear-panel>
          Dismiss
        </button>
      </div>
      ${this.payload.status ? `<p class="vc-panel-status">${escapeHtml(this.payload.status)}</p>` : ""}
      <div class="vc-component-stack">
        ${this.payload.components.map((component, index) => this.renderComponent(component, index)).join("")}
      </div>
    `;
    this.bindEvents();
    this.startTicker();
  }

  replace(payload) {
    this.payload = normalizePanel(payload);
    this.render();
  }

  applyUpdates(payload) {
    if (payload.title) {
      this.payload.title = String(payload.title);
    }
    if (payload.subtitle !== undefined) {
      this.payload.subtitle = String(payload.subtitle || "");
    }
    if (payload.status !== undefined) {
      this.payload.status = String(payload.status || "");
    }

    (payload.updates || []).forEach((update) => {
      const index = Number(update.index);
      if (!Number.isInteger(index) || index < 0 || index >= this.payload.components.length) {
        return;
      }
      const existing = this.payload.components[index];
      this.payload.components[index] = {
        ...existing,
        ...update.changes,
      };
    });

    this.render();
  }

  renderComponent(component, index) {
    switch (component.type) {
      case "heading":
        return `<h4 class="vc-heading">${escapeHtml(component.text || "")}</h4>`;
      case "text":
        return `<p class="vc-text">${escapeHtml(component.content || component.text || "")}</p>`;
      case "callout":
        return this.renderCallout(component);
      case "fact":
        return this.renderFact(component);
      case "list":
        return this.renderList(component);
      case "divider":
        return `<hr class="vc-divider" />`;
      case "step":
        return this.renderStep(component, index);
      case "button":
        return this.renderButton(component, index);
      case "timer":
        return this.renderTimer(component, index);
      default:
        return `<p class="vc-text">${escapeHtml(component.text || component.content || "")}</p>`;
    }
  }

  renderCallout(component) {
    const tone = ["warning", "success"].includes(component.tone) ? component.tone : "neutral";
    const titleMarkup = component.title
      ? `<p class="vc-callout-title">${escapeHtml(component.title)}</p>`
      : "";
    return `
      <section class="vc-callout vc-callout--${tone}">
        ${titleMarkup}
        <p class="vc-callout-text">${escapeHtml(component.text || component.content || "")}</p>
      </section>
    `;
  }

  renderFact(component) {
    return `
      <section class="vc-fact">
        <span class="vc-fact-label">${escapeHtml(component.label || "Detail")}</span>
        <strong class="vc-fact-value">${escapeHtml(component.value || component.text || "")}</strong>
      </section>
    `;
  }

  renderList(component) {
    const items = Array.isArray(component.items) ? component.items : [];
    const tag = component.ordered ? "ol" : "ul";
    const listItems = items
      .map((item) => `<li>${escapeHtml(typeof item === "string" ? item : String(item || ""))}</li>`)
      .join("");

    return `<${tag} class="vc-list">${listItems}</${tag}>`;
  }

  renderStep(component, index) {
    const state = normalizeStepState(component);
    const numberLabel = component.number || index + 1;
    const noteMarkup = component.note
      ? `<p class="vc-step-note">${escapeHtml(component.note)}</p>`
      : "";

    return `
      <button
        class="vc-step ${state.className}"
        type="button"
        data-toggle-step="${index}"
        ${component.checkable === false ? "disabled" : ""}
      >
        <span class="vc-step-number">${state.checked ? "✓" : escapeHtml(String(numberLabel))}</span>
        <span class="vc-step-body">
          <span class="vc-step-text">${escapeHtml(component.text || component.label || "")}</span>
          ${noteMarkup}
        </span>
      </button>
    `;
  }

  renderButton(component, index) {
    const style = component.style === "secondary" ? "" : " vc-btn--primary";
    return `
      <button class="vc-btn${style}" type="button" data-panel-button="${index}">
        ${escapeHtml(component.label || "Continue")}
      </button>
    `;
  }

  renderTimer(component, index) {
    const timerState = this.ensureTimerState(index, component);
    const primaryLabel = timerState.running ? "Pause" : "Start";
    return `
      <section class="vc-inline-timer" data-inline-timer="${index}">
        <div class="vc-inline-timer-topline">
          <span class="vc-inline-timer-label">${escapeHtml(component.label || "Timer")}</span>
          <span class="vc-inline-timer-time" data-inline-timer-display="${index}">
            ${formatTime(timerState.remainingMs)}
          </span>
        </div>
        <div class="card-actions">
          <button class="card-button card-button--primary" type="button" data-timer-toggle="${index}">
            ${primaryLabel}
          </button>
          <button class="card-button" type="button" data-timer-reset="${index}">
            Reset
          </button>
        </div>
      </section>
    `;
  }

  bindEvents() {
    this.container.querySelector("[data-clear-panel]")?.addEventListener("click", () => {
      this.onClear(this.payload.id);
    });

    this.container.querySelectorAll("[data-toggle-step]").forEach((node) => {
      node.addEventListener("click", () => {
        const index = Number(node.dataset.toggleStep);
        const component = this.payload.components[index];
        if (!component || component.checkable === false) {
          return;
        }

        const checked = !(component.checked || component.state === "done");
        this.payload.components[index] = {
          ...component,
          checked,
          state: checked ? "done" : "pending",
        };
        this.render();
      });
    });

    this.container.querySelectorAll("[data-panel-button]").forEach((node) => {
      node.addEventListener("click", async () => {
        const index = Number(node.dataset.panelButton);
        const component = this.payload.components[index];
        if (!component) {
          return;
        }
        await this.handlePanelButton(component);
      });
    });

    this.container.querySelectorAll("[data-timer-toggle]").forEach((node) => {
      node.addEventListener("click", () => {
        const index = Number(node.dataset.timerToggle);
        const timerState = this.timerStates.get(index);
        if (!timerState) {
          return;
        }

        if (timerState.running) {
          timerState.remainingMs = this.getRemainingMs(timerState);
          timerState.running = false;
          timerState.deadline = null;
        } else {
          timerState.running = true;
          timerState.deadline = Date.now() + timerState.remainingMs;
        }
        this.render();
      });
    });

    this.container.querySelectorAll("[data-timer-reset]").forEach((node) => {
      node.addEventListener("click", () => {
        const index = Number(node.dataset.timerReset);
        const component = this.payload.components[index];
        const timerState = this.timerStates.get(index);
        if (!timerState || !component) {
          return;
        }

        timerState.durationMs = Math.max(1, Number(component.minutes || 1)) * 60 * 1000;
        timerState.remainingMs = timerState.durationMs;
        timerState.running = Boolean(component.autoStart);
        timerState.deadline = timerState.running ? Date.now() + timerState.remainingMs : null;
        this.render();
      });
    });
  }

  async handlePanelButton(component) {
    switch (component.action) {
      case "open_url":
        if (component.url) {
          window.open(component.url, "_blank", "noopener,noreferrer");
        }
        return;
      case "browser_notification":
        if (!("Notification" in window)) {
          return;
        }
        if (Notification.permission !== "granted") {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") {
            return;
          }
        }
        new Notification(component.label || this.payload.title, {
          body: component.message || this.payload.status || "VoiceCraft is ready for the next step.",
        });
        return;
      case "clear_panel":
        this.onClear(this.payload.id);
        return;
      default:
        return;
    }
  }

  syncTimerStates() {
    const next = new Map();
    this.payload.components.forEach((component, index) => {
      if (component.type !== "timer") {
        return;
      }
      next.set(index, this.ensureTimerState(index, component));
    });
    this.timerStates = next;
  }

  ensureTimerState(index, component) {
    const requestedDurationMs = Math.max(1, Number(component.minutes || 1)) * 60 * 1000;
    const existing = this.timerStates.get(index);

    if (existing && existing.requestedDurationMs === requestedDurationMs) {
      return existing;
    }

    const timerState = {
      requestedDurationMs,
      durationMs: requestedDurationMs,
      remainingMs: requestedDurationMs,
      running: Boolean(component.autoStart),
      deadline: Boolean(component.autoStart) ? Date.now() + requestedDurationMs : null,
    };
    this.timerStates.set(index, timerState);
    return timerState;
  }

  getRemainingMs(timerState) {
    if (!timerState.running || !timerState.deadline) {
      return timerState.remainingMs;
    }
    return Math.max(0, timerState.deadline - Date.now());
  }

  startTicker() {
    if (this.tickIntervalId) {
      return;
    }
    this.tickIntervalId = window.setInterval(() => {
      let shouldRefreshMarkup = false;

      this.timerStates.forEach((timerState, index) => {
        const remainingMs = this.getRemainingMs(timerState);
        const display = this.container.querySelector(`[data-inline-timer-display="${index}"]`);
        if (display) {
          display.textContent = formatTime(remainingMs);
        }

        if (remainingMs <= 0 && timerState.running) {
          timerState.running = false;
          timerState.deadline = null;
          timerState.remainingMs = 0;
          shouldRefreshMarkup = true;
        } else {
          timerState.remainingMs = remainingMs;
        }
      });

      if (shouldRefreshMarkup) {
        this.render();
      }
    }, 250);
  }

  dispose() {
    if (this.tickIntervalId) {
      window.clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
  }
}

function normalizeCard(card) {
  return {
    id: card.id || `${card.type || "card"}-${Date.now()}`,
    type: card.type || "info",
    title: card.title || "VoiceCraft",
    ...card,
  };
}

function isPanelPayload(payload) {
  return payload.kind === "panel" || Array.isArray(payload.components) || Array.isArray(payload.updates);
}

function normalizePanel(payload) {
  return {
    id: payload.id || `panel-${Date.now()}`,
    kind: "panel",
    title: payload.title || "Task Board",
    subtitle: payload.subtitle || "",
    status: payload.status || "",
    components: (payload.components || []).map((component) => ({
      ...component,
      type: component.type || "text",
    })),
  };
}

function normalizeStepState(component) {
  const checked = Boolean(component.checked) || component.state === "done";
  const state = component.state || (checked ? "done" : "pending");
  return {
    checked,
    className:
      state === "done"
        ? "is-done"
        : state === "current"
          ? "is-current"
          : "is-pending",
  };
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
