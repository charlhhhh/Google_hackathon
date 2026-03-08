export class AudioHandler {
  constructor() {
    this.inputContext = null;
    this.outputContext = null;
    this.captureNode = null;
    this.captureSource = null;
    this.captureSink = null;
    this.playerNode = null;
  }

  async attachInputStream(stream, onAudioChunk) {
    await this.ensureContexts();

    if (this.captureNode) {
      this.captureNode.disconnect();
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      return;
    }

    const audioStream = new MediaStream(audioTracks);
    this.captureSource = this.inputContext.createMediaStreamSource(audioStream);
    this.captureNode = new AudioWorkletNode(this.inputContext, "pcm-processor");
    this.captureSink = this.inputContext.createGain();
    this.captureSink.gain.value = 0;
    this.captureNode.port.onmessage = (event) => {
      onAudioChunk(event.data);
    };

    this.captureSource.connect(this.captureNode);
    this.captureNode.connect(this.captureSink);
    this.captureSink.connect(this.inputContext.destination);

    await this.resume();
  }

  async ensureContexts() {
    if (!this.inputContext) {
      this.inputContext = new AudioContext();
      await this.inputContext.audioWorklet.addModule("/assets/pcm-processor.js");
    }

    if (!this.outputContext) {
      this.outputContext = new AudioContext({ sampleRate: 24000 });
      await this.outputContext.audioWorklet.addModule(
        "/assets/pcm-player-processor.js",
      );
      this.playerNode = new AudioWorkletNode(
        this.outputContext,
        "pcm-player-processor",
      );
      this.playerNode.connect(this.outputContext.destination);
    }
  }

  async resume() {
    if (this.inputContext?.state === "suspended") {
      await this.inputContext.resume();
    }
    if (this.outputContext?.state === "suspended") {
      await this.outputContext.resume();
    }
  }

  playPcmChunk(base64Data) {
    if (!this.playerNode) {
      return;
    }

    const audioBuffer = base64ToArrayBuffer(base64Data);
    this.playerNode.port.postMessage(audioBuffer, [audioBuffer]);
  }

  flushPlayback() {
    if (!this.playerNode) {
      return;
    }
    this.playerNode.port.postMessage({ command: "flush" });
  }
}

function base64ToArrayBuffer(base64) {
  let normalized = base64.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4) {
    normalized += "=";
  }

  const binaryString = window.atob(normalized);
  const bytes = new Uint8Array(binaryString.length);
  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }
  return bytes.buffer;
}

