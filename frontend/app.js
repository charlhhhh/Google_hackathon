import { AudioHandler } from "/assets/audio-handler.js";
import { CardRenderer } from "/assets/components/card-renderer.js";

const appShell = document.getElementById("app-shell");
const startButton = document.getElementById("start-button");
const micButton = document.getElementById("mic-button");
const micLabel = document.getElementById("mic-label");
const cameraButton = document.getElementById("camera-button");
const cameraLabel = document.getElementById("camera-label");
const cameraToggleDot = document.getElementById("camera-toggle-dot");
const statusText = document.getElementById("status-text");
const statusDot = document.getElementById("status-dot");
const cameraPreview = document.getElementById("camera-preview");
const cameraFallback = document.getElementById("camera-fallback");
const transcriptStrip = document.getElementById("transcript-strip");
const cardsCanvas = document.getElementById("cards-canvas");
const skillButtons = Array.from(document.querySelectorAll(".skill-chip"));

const audioHandler = new AudioHandler();
const cardRenderer = new CardRenderer(cardsCanvas);

const state = {
  websocket: null,
  audioStream: null,
  videoStream: null,
  started: false,
  listening: false,
  cameraEnabled: false,
  manualClose: false,
  frameIntervalId: null,
  reconnectTimeoutId: null,
  userId: getStableId("voicecraft-user"),
  sessionId: createSessionId(),
  transcripts: [],
  assistantAudioUntil: 0,
};

const captureCanvas = document.createElement("canvas");
captureCanvas.width = 768;
captureCanvas.height = 768;

startButton.addEventListener("click", () => {
  void startExperience();
});

micButton.addEventListener("click", () => {
  void handleMicButton();
});

cameraButton.addEventListener("click", () => {
  void handleCameraButton();
});

skillButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    await startExperience();
    if (!state.started) {
      return;
    }

    sendJson({
      type: "text",
      text: button.dataset.prompt,
    });
  });
});

window.addEventListener("beforeunload", () => {
  teardown();
});

window.setInterval(() => {
  const isSpeaking = Date.now() < state.assistantAudioUntil;
  appShell.classList.toggle("assistant-speaking", isSpeaking);
}, 150);

syncStartButton();
syncMicButton();
syncCameraButton();

async function startExperience() {
  if (state.started) {
    return;
  }

  setStatus("Requesting microphone access…", "pending");

  try {
    state.audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  } catch (error) {
    setStatus(`Microphone unavailable: ${error.message}`, "error");
    return;
  }

  await audioHandler.attachInputStream(state.audioStream, handleAudioChunk);

  try {
    await connectWebSocket();
  } catch (error) {
    setStatus("Could not connect to VoiceCraft.", "error");
    return;
  }

  state.started = true;
  state.listening = true;
  state.manualClose = false;
  setAudioTracksEnabled(true);
  appShell.classList.add("is-listening");
  syncStartButton();
  syncMicButton();
  syncCameraButton();
  setStatus("Voice is live. Turn on the camera when you want visual guidance.", "live");
}

async function handleMicButton() {
  if (!state.started) {
    await startExperience();
    return;
  }

  state.listening = !state.listening;
  setAudioTracksEnabled(state.listening);
  appShell.classList.toggle("is-listening", state.listening);
  syncMicButton();
  setStatus(state.listening ? "Microphone is live." : "Microphone is muted.", "live");
}

async function handleCameraButton() {
  if (!state.started) {
    await startExperience();
  }
  if (!state.started) {
    return;
  }

  if (state.cameraEnabled) {
    disableCamera();
    return;
  }

  await enableCamera();
}

async function enableCamera() {
  setStatus("Requesting camera access…", "pending");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 768 },
        height: { ideal: 768 },
      },
    });

    if (state.videoStream) {
      state.videoStream.getTracks().forEach((track) => track.stop());
    }

    state.videoStream = stream;
    state.cameraEnabled = true;
    bindVideoStream(stream);
    syncCameraButton();
    startFrameStreaming();
    setStatus("Camera is live. Show what you need help with.", "live");
  } catch (error) {
    state.cameraEnabled = false;
    syncCameraButton();
    setStatus(`Camera unavailable: ${error.message}`, "error");
  }
}

function disableCamera() {
  stopFrameStreaming();

  if (state.videoStream) {
    state.videoStream.getTracks().forEach((track) => track.stop());
    state.videoStream = null;
  }

  state.cameraEnabled = false;
  cameraPreview.pause();
  cameraPreview.srcObject = null;
  cameraPreview.parentElement.classList.remove("has-video");
  cameraFallback.hidden = false;
  syncCameraButton();
  setStatus("Camera is off. Voice mode is still active.", "pending");
}

async function connectWebSocket() {
  if (state.websocket?.readyState === WebSocket.OPEN) {
    return;
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${window.location.host}/ws/${state.userId}/${state.sessionId}`;

  await new Promise((resolve, reject) => {
    const websocket = new WebSocket(url);
    state.websocket = websocket;

    websocket.onopen = () => {
      setStatus("Connected. Start speaking when you're ready.", "live");
      resolve();
    };

    websocket.onerror = () => {
      setStatus("WebSocket connection failed.", "error");
      reject(new Error("WebSocket connection failed"));
    };

    websocket.onclose = () => {
      if (state.manualClose) {
        return;
      }

      setStatus("Connection dropped. Reconnecting…", "error");
      stopFrameStreaming();
      if (state.started) {
        scheduleReconnect();
      }
    };

    websocket.onmessage = (messageEvent) => {
      const message = JSON.parse(messageEvent.data);
      handleServerMessage(message);
    };
  });
}

function scheduleReconnect() {
  if (state.reconnectTimeoutId) {
    return;
  }

  state.reconnectTimeoutId = window.setTimeout(async () => {
    state.reconnectTimeoutId = null;
    try {
      await connectWebSocket();
      if (state.cameraEnabled) {
        startFrameStreaming();
      }
    } catch (error) {
      scheduleReconnect();
    }
  }, 1200);
}

function bindVideoStream(stream) {
  const videoTracks = stream.getVideoTracks();
  if (videoTracks.length === 0) {
    cameraPreview.parentElement.classList.remove("has-video");
    cameraFallback.hidden = false;
    return;
  }

  cameraPreview.srcObject = new MediaStream(videoTracks);
  cameraPreview
    .play()
    .then(() => {
      cameraPreview.parentElement.classList.add("has-video");
      cameraFallback.hidden = true;
    })
    .catch(() => {
      cameraPreview.parentElement.classList.remove("has-video");
      cameraFallback.hidden = false;
    });
}

function startFrameStreaming() {
  stopFrameStreaming();

  if (!state.cameraEnabled || !state.videoStream || state.videoStream.getVideoTracks().length === 0) {
    return;
  }

  state.frameIntervalId = window.setInterval(() => {
    if (!socketReady()) {
      return;
    }

    const width = cameraPreview.videoWidth;
    const height = cameraPreview.videoHeight;
    if (!width || !height) {
      return;
    }

    const context = captureCanvas.getContext("2d");
    if (!context) {
      return;
    }

    context.drawImage(cameraPreview, 0, 0, captureCanvas.width, captureCanvas.height);
    const dataUrl = captureCanvas.toDataURL("image/jpeg", 0.78);
    sendJson({
      type: "image",
      mimeType: "image/jpeg",
      data: dataUrl.split(",")[1],
    });
  }, 1000);
}

function stopFrameStreaming() {
  if (state.frameIntervalId) {
    window.clearInterval(state.frameIntervalId);
    state.frameIntervalId = null;
  }
}

function handleAudioChunk(arrayBuffer) {
  if (!socketReady() || !state.listening) {
    return;
  }

  sendJson({
    type: "audio",
    mimeType: "audio/pcm;rate=16000",
    data: arrayBufferToBase64(arrayBuffer),
  });
}

function handleServerMessage(message) {
  switch (message.type) {
    case "status":
      setStatus(message.message, message.level === "warn" ? "pending" : message.level);
      break;
    case "tool_call":
      cardsCanvas.classList.add("is-loading");
      setStatus(`AI is building ${humanizeToolName(message.tool)}…`, "pending");
      break;
    case "tool_response":
      cardsCanvas.classList.remove("is-loading");
      cardRenderer.handleToolResponse(message.payload);
      setStatus(describeToolResult(message.tool, message.payload), "live");
      break;
    case "adk_event":
      handleAdkEvent(message.event);
      break;
    default:
      break;
  }
}

function handleAdkEvent(event) {
  if (event.interrupted === true) {
    audioHandler.flushPlayback();
    return;
  }

  if (event.inputTranscription?.text) {
    pushTranscript("user", event.inputTranscription.text, event.inputTranscription.finished);
  }

  if (event.outputTranscription?.text) {
    pushTranscript(
      "assistant",
      event.outputTranscription.text,
      event.outputTranscription.finished,
    );
  }

  if (!event.content?.parts) {
    return;
  }

  event.content.parts.forEach((part) => {
    if (part.inlineData?.mimeType?.startsWith("audio/pcm")) {
      audioHandler.playPcmChunk(part.inlineData.data);
      state.assistantAudioUntil = Date.now() + 900;
    }

    if (part.text && !event.outputTranscription?.text) {
      pushTranscript("assistant", part.text, false);
    }

    const functionResponse = part.functionResponse || part.function_response;
    if (functionResponse?.response) {
      cardRenderer.handleToolResponse(functionResponse.response);
    }
  });
}

function pushTranscript(speaker, text, finished) {
  if (!text || !text.trim()) {
    return;
  }

  const last = state.transcripts[state.transcripts.length - 1];
  if (last && last.speaker === speaker && last.finished === false) {
    last.text = text;
    last.finished = Boolean(finished);
  } else {
    state.transcripts.push({
      id: createSessionId(),
      speaker,
      text,
      finished: Boolean(finished),
    });
  }

  state.transcripts = state.transcripts.slice(-4);
  renderTranscripts();

  const lastLine = transcriptStrip.lastElementChild;
  if (lastLine) {
    lastLine.scrollIntoView({ behavior: "smooth", block: "end" });
  }
}

function renderTranscripts() {
  transcriptStrip.innerHTML = "";

  state.transcripts.forEach((entry) => {
    const line = document.createElement("div");
    line.className = "transcript-line";
    line.dataset.speaker = entry.speaker;
    line.textContent = `${entry.speaker === "user" ? "You" : "AI"}: ${entry.text}`;
    transcriptStrip.appendChild(line);
  });
}

function setStatus(text, level = "pending") {
  statusText.textContent = text;
  statusDot.classList.remove("is-live", "is-error");
  if (level === "live") {
    statusDot.classList.add("is-live");
  } else if (level === "error") {
    statusDot.classList.add("is-error");
  }
}

function syncStartButton() {
  startButton.textContent = state.started ? "Voice Live" : "Start Voice";
  startButton.disabled = state.started;
}

function syncMicButton() {
  micLabel.textContent = !state.started
    ? "Start Listening"
    : state.listening
      ? "Mic Live"
      : "Mic Muted";
}

function syncCameraButton() {
  cameraLabel.textContent = state.cameraEnabled ? "Turn Camera Off" : "Enable Camera";
  cameraToggleDot.classList.toggle("is-live", state.cameraEnabled);
}

function setAudioTracksEnabled(enabled) {
  if (!state.audioStream) {
    return;
  }

  state.audioStream.getAudioTracks().forEach((track) => {
    track.enabled = enabled;
  });
}

function describeToolResult(toolName, payload) {
  if (payload?.action === "create" && payload?.kind === "panel") {
    return "Task board created.";
  }
  if (payload?.action === "update" && payload?.kind === "panel") {
    return "Task board updated.";
  }
  if (payload?.action === "clear" && payload?.kind === "panel") {
    return "Task board cleared.";
  }
  if (toolName === "show_timer") {
    return "Timer ready.";
  }
  if (toolName === "show_reminder") {
    return "Reminder ready.";
  }
  if (toolName === "show_guided_task") {
    return "Guided task board ready.";
  }
  if (toolName === "show_navigation_board") {
    return "Navigation board ready.";
  }
  return `${humanizeToolName(toolName)} completed.`;
}

function humanizeToolName(toolName) {
  return String(toolName || "tool").replaceAll("_", " ");
}

function sendJson(payload) {
  if (!socketReady()) {
    return;
  }

  state.websocket.send(JSON.stringify(payload));
}

function socketReady() {
  return state.websocket && state.websocket.readyState === WebSocket.OPEN;
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return window.btoa(binary);
}

function createSessionId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `session-${Math.random().toString(36).slice(2, 10)}`;
}

function getStableId(storageKey) {
  const existing = window.localStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }

  const generated = createSessionId();
  window.localStorage.setItem(storageKey, generated);
  return generated;
}

function teardown() {
  state.manualClose = true;
  stopFrameStreaming();

  if (state.reconnectTimeoutId) {
    window.clearTimeout(state.reconnectTimeoutId);
  }

  if (socketReady()) {
    sendJson({ type: "close" });
    state.websocket.close();
  }

  if (state.audioStream) {
    state.audioStream.getTracks().forEach((track) => track.stop());
  }

  if (state.videoStream) {
    state.videoStream.getTracks().forEach((track) => track.stop());
  }
}
