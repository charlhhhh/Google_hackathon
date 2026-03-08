class PCMProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (input && input[0]) {
      const channel = input[0];
      const downsampled = downsampleBuffer(channel, sampleRate, 16000);
      if (downsampled.length > 0) {
        this.port.postMessage(downsampled.buffer, [downsampled.buffer]);
      }

      if (output && output[0]) {
        output[0].set(channel);
      }
    }

    return true;
  }
}

function downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
  if (outputSampleRate >= inputSampleRate) {
    return floatTo16BitPCM(buffer);
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Int16Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;

    for (
      let index = offsetBuffer;
      index < nextOffsetBuffer && index < buffer.length;
      index += 1
    ) {
      accum += buffer[index];
      count += 1;
    }

    const sample = count > 0 ? accum / count : 0;
    result[offsetResult] = clampToInt16(sample);
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function floatTo16BitPCM(float32Array) {
  const result = new Int16Array(float32Array.length);
  for (let index = 0; index < float32Array.length; index += 1) {
    result[index] = clampToInt16(float32Array[index]);
  }
  return result;
}

function clampToInt16(sample) {
  const normalized = Math.max(-1, Math.min(1, sample));
  return normalized < 0 ? normalized * 0x8000 : normalized * 0x7fff;
}

registerProcessor("pcm-processor", PCMProcessor);

