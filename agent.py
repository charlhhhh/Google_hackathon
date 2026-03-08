import os
import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from google.adk.agents import Agent
from google.adk.models.google_llm import Gemini
from google.adk.tools import google_search
from google.genai import types


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _coerce_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            return parsed
    return {}


def _card(card_type: str, title: str, **payload: Any) -> dict[str, Any]:
    return {
        "id": f"{card_type}-{uuid4().hex[:8]}",
        "type": card_type,
        "title": title.strip() or "VoiceCraft",
        "createdAt": _timestamp(),
        **payload,
    }


def _panel(title: str, components: list[dict[str, Any]], **payload: Any) -> dict[str, Any]:
    return {
        "action": "create",
        "kind": "panel",
        "id": f"panel-{uuid4().hex[:8]}",
        "title": title.strip() or "Task Board",
        "components": components,
        "createdAt": _timestamp(),
        **payload,
    }


def show_timer(minutes: int, label: str = "Timer") -> dict[str, Any]:
    """Create a standalone countdown timer for clear, single-purpose timing tasks."""
    safe_minutes = max(1, int(minutes or 1))
    safe_label = label.strip() or "Timer"
    return _card(
        "timer",
        safe_label,
        minutes=safe_minutes,
        label=safe_label,
        autoStart=True,
    )


def show_reminder(
    time: str,
    text: str,
    scheduled_for: str = "",
) -> dict[str, Any]:
    """Create a standalone reminder card with optional browser notification timing."""
    safe_time = time.strip() or "Later"
    safe_text = text.strip() or "Remind me"
    return _card(
        "reminder",
        "Reminder",
        time=safe_time,
        text=safe_text,
        scheduledFor=scheduled_for.strip(),
    )


def render_panel(
    title: str,
    components: list[dict[str, Any]],
    subtitle: str = "",
    status: str = "",
) -> dict[str, Any]:
    """Create a coach panel with structured components.

    Supported component shapes:
    - {"type": "heading", "text": "..."}
    - {"type": "text", "content": "..."}
    - {"type": "callout", "title": "...", "text": "...", "tone": "neutral|success|warning"}
    - {"type": "fact", "label": "...", "value": "..."}
    - {"type": "list", "items": ["..."], "ordered": false}
    - {"type": "step", "text": "...", "note": "...", "state": "pending|current|done", "checked": false, "checkable": true}
    - {"type": "button", "label": "...", "action": "open_url|browser_notification|clear_panel", "url": "...", "style": "primary|secondary"}
    - {"type": "timer", "label": "...", "minutes": 5, "autoStart": true}
    - {"type": "divider"}
    """
    normalized_components = []
    for component in components:
        normalized_component = _coerce_object(component)
        if normalized_component.get("type"):
            normalized_components.append(normalized_component)
    return _panel(
        title,
        normalized_components[:12],
        subtitle=subtitle.strip(),
        status=status.strip(),
    )


def show_guided_task(
    title: str,
    steps: list[str],
    current_step: int = 1,
    context: str = "",
    caution: str = "",
    facts: list[str] | None = None,
) -> dict[str, Any]:
    """Create a structured guided task board for navigation, setup, and walkthrough flows."""
    safe_steps = [step.strip() for step in steps if isinstance(step, str) and step.strip()][:6]
    if not safe_steps:
        safe_steps = ["Start with the first available step."]

    step_index = min(max(int(current_step or 1), 1), len(safe_steps))
    safe_facts = [fact.strip() for fact in (facts or []) if isinstance(fact, str) and fact.strip()][:4]

    components: list[dict[str, Any]] = []
    if context.strip():
        components.append(
            {
                "type": "callout",
                "title": "Overview",
                "text": context.strip(),
                "tone": "neutral",
            }
        )
    if safe_facts:
        components.append(
            {
                "type": "list",
                "items": safe_facts,
                "ordered": False,
            }
        )
    if caution.strip():
        components.append(
            {
                "type": "callout",
                "title": "Watch for this",
                "text": caution.strip(),
                "tone": "warning",
            }
        )

    for index, step in enumerate(safe_steps, start=1):
        state = "done" if index < step_index else "current" if index == step_index else "pending"
        components.append(
            {
                "type": "step",
                "number": index,
                "text": step,
                "state": state,
                "checked": state == "done",
                "checkable": True,
            }
        )

    return _panel(
        title,
        components[:10],
        status=f"Step {step_index} of {len(safe_steps)}",
    )


def show_navigation_board(
    destination: str,
    steps: list[str],
    current_step: int = 1,
    starting_point: str = "",
    eta: str = "",
    mode: str = "",
    caution: str = "",
) -> dict[str, Any]:
    """Create a route-focused task board for navigation flows."""
    safe_destination = destination.strip() or "Destination"
    safe_steps = [step.strip() for step in steps if isinstance(step, str) and step.strip()][:6]
    if not safe_steps:
        safe_steps = ["Share your starting point so I can guide the route."]

    step_index = min(max(int(current_step or 1), 1), len(safe_steps))
    components: list[dict[str, Any]] = []

    if starting_point.strip():
        components.append({"type": "fact", "label": "Start", "value": starting_point.strip()})
    if mode.strip():
        components.append({"type": "fact", "label": "Mode", "value": mode.strip()})
    if eta.strip():
        components.append({"type": "fact", "label": "ETA", "value": eta.strip()})
    if caution.strip():
        components.append(
            {
                "type": "callout",
                "title": "Watch for this",
                "text": caution.strip(),
                "tone": "warning",
            }
        )

    for index, step in enumerate(safe_steps, start=1):
        state = "done" if index < step_index else "current" if index == step_index else "pending"
        components.append(
            {
                "type": "step",
                "number": index,
                "text": step,
                "state": state,
                "checked": state == "done",
                "checkable": True,
            }
        )

    return _panel(
        f"Go to {safe_destination}",
        components[:10],
        status=f"Step {step_index} of {len(safe_steps)}",
    )


def update_panel(
    panel_id: str,
    updates: list[dict[str, Any]],
    status: str = "",
) -> dict[str, Any]:
    """Update an existing coach panel by component index.

    Example:
    - {"index": 0, "changes": {"state": "done", "checked": true}}
    - {"index": 1, "changes": {"state": "current"}}
    """
    normalized_updates = []
    for update in updates:
        normalized_update = _coerce_object(update)
        normalized_changes = _coerce_object(normalized_update.get("changes"))
        if "index" not in normalized_update or not normalized_changes:
            continue
        try:
            index = int(normalized_update["index"])
        except (TypeError, ValueError):
            continue
        normalized_updates.append(
            {
                "index": index,
                "changes": normalized_changes,
            }
        )

    return {
        "action": "update",
        "kind": "panel",
        "id": panel_id.strip(),
        "updates": normalized_updates[:16],
        "status": status.strip(),
        "updatedAt": _timestamp(),
    }


def clear_panel(panel_id: str = "") -> dict[str, Any]:
    """Clear one coach panel by id, or all coach panels when no id is provided."""
    return {
        "action": "clear",
        "kind": "panel",
        "id": panel_id.strip(),
        "clearedAt": _timestamp(),
    }


VOICECRAFT_MODEL = os.getenv(
    "VOICECRAFT_MODEL",
    "gemini-live-2.5-flash-native-audio",
)
VOICECRAFT_VOICE = os.getenv("VOICECRAFT_VOICE", "Aoede")

voicecraft_llm = Gemini(
    model=VOICECRAFT_MODEL,
    speech_config=types.SpeechConfig(
        voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                voice_name=VOICECRAFT_VOICE,
            )
        )
    ),
)

VOICECRAFT_INSTRUCTION = """
You are VoiceCraft, a premium multimodal coach. You speak clearly, observe the camera when available, and build polished task boards on screen.

Core behavior:
- Default to English for speech and on-screen UI.
- Only switch languages if the user explicitly asks for another language.
- Treat the screen as part of your answer, not a fallback.
- For anything beyond a pure timer or pure reminder, create or update a task board in the same turn.
- Keep spoken responses brief. Put structure and detail on screen.

Critical tool rules:
- show_timer: use only for a simple countdown or pomodoro request.
- show_reminder: use only for a simple reminder request.
- show_navigation_board: use for navigation and route guidance.
- show_guided_task: use for navigation, device setup, recipes, how-to flows, and any guided step-by-step task.
- render_panel: use for almost everything else, including setup help, how-to guidance, medicine, recipes, translations, travel, shopping, comparison, summaries, or any situation where visual structure helps.
- update_panel: when you infer progress from speech or camera frames, mark the completed step and move exactly one next step to current.
- clear_panel: use when the task is complete or the screen would benefit from cleanup.
- google_search: use for live facts, then present the result in a task board.

Task board quality:
- Build strong boards, not weak text dumps.
- For non-trivial tasks, use 4 to 8 components.
- Prefer a mix of heading, callout, fact, list, step, timer, divider, text, and button.
- For navigation, prefer google_search plus show_navigation_board.
- If the user asks for navigation but you do not know the starting point, still create a navigation board with a first step that asks for the starting point.
- Prefer show_guided_task over render_panel when the main output is an ordered sequence of steps.
- Use callout for the single most important warning or highlight.
- Use fact for compact key-value details such as dosage, station, ETA, or weather.
- Use list for ingredients, options, or quick takeaways.
- Use step for action flows and keep one current step active at a time.
- Titles should be short and action-oriented.
- Use subtitle and status when they improve clarity.

Camera coaching:
- If you can see something relevant, say one short observation first.
- Then create or update the task board with the relevant information.
- If the view is ambiguous, say what you noticed and ask one short follow-up question.
- Never pretend to control the device or another app. You are guiding, not operating it.

Examples:
- Wi-Fi help: create a board with a callout, 3 to 5 steps, and a short status.
- Medication help: create a board with facts, a warning callout, a list, and a reminder if needed.
- Recipe help: create a board with a summary, ingredient list, step flow, and timer.
- Navigation summary: use google_search, then create a navigation board with route facts, step flow, and one key warning or landmark.
""".strip()

root_agent = Agent(
    name="voicecraft_coach",
    model=voicecraft_llm,
    description="A multimodal coach that speaks clearly and builds dynamic task boards.",
    instruction=VOICECRAFT_INSTRUCTION,
    tools=[
        google_search,
        show_timer,
        show_reminder,
        show_navigation_board,
        show_guided_task,
        render_panel,
        update_panel,
        clear_panel,
    ],
)
