class PCMPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 24000 * 12;
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.available = 0;

    this.port.onmessage = (event) => {
      if (event.data?.command === "flush") {
        this.readIndex = this.writeIndex;
        this.available = 0;
        return;
      }

      const int16Samples = new Int16Array(event.data);
      for (let index = 0; index < int16Samples.length; index += 1) {
        this.buffer[this.writeIndex] = int16Samples[index] / 0x8000;
        this.writeIndex = (this.writeIndex + 1) % this.bufferSize;

        if (this.available < this.bufferSize) {
          this.available += 1;
        } else {
          this.readIndex = (this.readIndex + 1) % this.bufferSize;
        }
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0][0];
    for (let index = 0; index < output.length; index += 1) {
      if (this.available > 0) {
        output[index] = this.buffer[this.readIndex];
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
        this.available -= 1;
      } else {
        output[index] = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-player-processor", PCMPlayerProcessor);

