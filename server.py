import asyncio
import base64
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from google.adk.agents.live_request_queue import LiveRequestQueue
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from agent import VOICECRAFT_MODEL, root_agent

load_dotenv()

APP_NAME = "voicecraft"
BASE_DIR = Path(__file__).parent
FRONTEND_DIR = BASE_DIR / "frontend"

app = FastAPI(title="VoiceCraft")
app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR)), name="assets")

session_service = InMemorySessionService()
runner = Runner(
    app_name=APP_NAME,
    agent=root_agent,
    session_service=session_service,
)


def build_run_config() -> RunConfig:
    return RunConfig(
        streaming_mode=StreamingMode.BIDI,
        response_modalities=["AUDIO"],
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
    )


def parse_tool_payload(raw_payload: object) -> dict[str, object]:
    if isinstance(raw_payload, dict):
        return raw_payload
    if isinstance(raw_payload, str):
        try:
            parsed = json.loads(raw_payload)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
        return {
            "id": "tool-text",
            "type": "info",
            "title": "Tool result",
            "content": raw_payload,
        }
    return {
        "id": "tool-unknown",
        "type": "info",
        "title": "Tool result",
        "content": str(raw_payload),
    }


def format_runtime_error(error: Exception) -> str:
    message = str(error).strip()
    if not message:
        return "Live session failed."
    compact = " ".join(message.split())
    if len(compact) > 220:
        compact = f"{compact[:217]}..."
    return compact


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/index.html")
async def index_alias() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/healthz")
async def healthz() -> dict[str, object]:
    return {
        "ok": True,
        "model": VOICECRAFT_MODEL,
        "vertex": os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "FALSE"),
        "configured": bool(
            os.getenv("GOOGLE_API_KEY") or os.getenv("GOOGLE_CLOUD_PROJECT")
        ),
    }


@app.websocket("/ws/{user_id}/{session_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str,
    session_id: str,
) -> None:
    await websocket.accept()

    session = await session_service.get_session(
        app_name=APP_NAME,
        user_id=user_id,
        session_id=session_id,
    )
    if not session:
        await session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id,
        )

    live_request_queue = LiveRequestQueue()
    run_config = build_run_config()

    await websocket.send_json(
        {
            "type": "status",
            "level": "info",
            "message": "VoiceCraft session connected.",
        }
    )

    async def upstream_task() -> None:
        try:
            while True:
                raw_message = await websocket.receive_text()
                message = json.loads(raw_message)
                message_type = message.get("type")

                if message_type == "text":
                    text = (message.get("text") or "").strip()
                    if text:
                        content = types.Content(
                            role="user",
                            parts=[types.Part(text=text)],
                        )
                        live_request_queue.send_content(content)
                elif message_type == "audio":
                    audio_data = base64.b64decode(message["data"])
                    mime_type = (
                        message.get("mimeType")
                        or message.get("mime_type")
                        or "audio/pcm;rate=16000"
                    )
                    live_request_queue.send_realtime(
                        types.Blob(mime_type=mime_type, data=audio_data)
                    )
                elif message_type in {"image", "frame"}:
                    image_data = base64.b64decode(message["data"])
                    mime_type = (
                        message.get("mimeType")
                        or message.get("mime_type")
                        or "image/jpeg"
                    )
                    live_request_queue.send_realtime(
                        types.Blob(mime_type=mime_type, data=image_data)
                    )
                elif message_type == "close":
                    live_request_queue.close()
                    return
                elif message_type == "ping":
                    await websocket.send_json({"type": "pong"})
                else:
                    await websocket.send_json(
                        {
                            "type": "status",
                            "level": "warn",
                            "message": f"Unhandled message type: {message_type}",
                        }
                    )
        except WebSocketDisconnect:
            live_request_queue.close()

    async def downstream_task() -> None:
        try:
            async for event in runner.run_live(
                user_id=user_id,
                session_id=session_id,
                live_request_queue=live_request_queue,
                run_config=run_config,
            ):
                event_payload = json.loads(
                    event.model_dump_json(exclude_none=True, by_alias=True)
                )
                await websocket.send_json({"type": "adk_event", "event": event_payload})

                for function_call in event.get_function_calls() or []:
                    await websocket.send_json(
                        {
                            "type": "tool_call",
                            "tool": function_call.name,
                            "args": getattr(function_call, "args", {}) or {},
                        }
                    )

                for function_response in event.get_function_responses() or []:
                    await websocket.send_json(
                        {
                            "type": "tool_response",
                            "tool": function_response.name,
                            "payload": parse_tool_payload(function_response.response),
                        }
                    )
        except Exception as error:
            await websocket.send_json(
                {
                    "type": "status",
                    "level": "error",
                    "message": f"Live session error: {format_runtime_error(error)}",
                }
            )
            live_request_queue.close()

    try:
        await asyncio.gather(
            upstream_task(),
            downstream_task(),
            return_exceptions=True,
        )
    finally:
        live_request_queue.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=False,
    )
