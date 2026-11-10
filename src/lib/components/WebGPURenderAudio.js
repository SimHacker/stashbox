////////////////////////////////////////////////////////////////////////
// WebGPURenderAudio.js
// Copyright (C) 2023 by Don Hopkins.
// All rights reserved.

/* ChatGPT code review and discussion:

User:

Will these async functions synchronize properly? The intent is that if it takes a long time to read the audio from the gpu, calls to renderAudio will notice pumpingAudio is true (meaning it's busy reading from the gpu, so don't issue another read yet), and they will just remember nextTime the first time it tries to render audio while pumping, and next time it renders audio after it's done pumping it will coalesce previous writes (limited to the size of the audio buffer, up to the current time). Review that in intent and how the code implements it.  

ChatGPT:

The way you've structured the renderAudio function, with the check for pumpingAudio before performing the audio rendering operations, does seem to be a reasonable approach to preventing multiple reads from the GPU before a previous read has completed. When pumpingAudio is true, the renderAudio function will simply return, effectively "skipping" that call to renderAudio until the GPU read has completed and pumpingAudio is set back to false.

The nextTime variable is a mechanism to allow for 'catching up' with missed audio rendering calls. It stores the timestamp of when the pumping began, and is used to calculate the number of samples to be processed once the GPU is free. This ensures that no time is lost due to the delay in reading from the GPU.

Here are the key points of this approach:

Detecting when GPU is busy: The variable pumpingAudio is checked before any new rendering operation is begun, ensuring that the GPU is not overloaded with additional tasks.

Synchronizing audio rendering: By storing the timestamp nextTime when pumpingAudio is first detected, any skipped rendering calls can be compensated for in the next run of renderAudio once the GPU is free.

Preventing buffer overflow: The samples are capped at audioBufferLength, which ensures that the buffer is not overloaded with more samples than it can hold.

Please note, however, that there is a potential issue with this approach: the pumpingAudio variable is never set to true in the code provided. There should be a point at which pumpingAudio is set to true, likely just before starting a read from the GPU, and then reset to false when the read operation has completed.

Lastly, remember that this strategy assumes that the delay in reading from the GPU will be shorter than the interval at which renderAudio is called. If the GPU read takes longer than this interval, then nextTime will accumulate a larger and larger delay, potentially causing issues down the line if it's not properly managed. For instance, if nextTime becomes significantly larger than audioBufferLength / audioSampleRate, you could end up trying to render more samples than the buffer can hold.

User:

That's a good bug catch. I have fixed it:

        // Copy out the audio from GPU to CPU.

        pumpingAudio = true;
        nextTime = null;

ChatGPT:

Great! Setting pumpingAudio = true; just before you start copying out the audio from GPU to CPU and resetting nextTime = null; is the correct way to indicate that the GPU is busy and the system is waiting for the audio to be pumped out.

Here is how it will work:

Before starting to copy audio from the GPU, pumpingAudio is set to true. This indicates that the GPU is busy.

nextTime is reset to null as this will hold the timestamp of the first renderAudio call that gets skipped.

During the GPU read operation, any calls to renderAudio will see that pumpingAudio is true and therefore not proceed with rendering new audio.

nextTime will store the timestamp of the first call to renderAudio that is skipped. This allows the system to "catch up" with the missed rendering operations once the GPU is free.

When the GPU read operation is finished, pumpingAudio is set back to false and the audio rendering can resume.

This seems like a good mechanism to manage the synchronization between rendering and reading the audio from GPU. It should ensure that the GPU is not overloaded with tasks, while also making sure that no audio rendering is lost due to the delay in reading from the GPU.

However, remember to reset pumpingAudio to false at the end of the GPU read operation. This can be done after the source.start(); line inside the pumpingPromise.then() block. This signals that the GPU read operation is finished, and the next audio rendering can proceed.

User:

Note that nextTime is set to now - passed, which is the BEGINNING of the audio that we want to render. Instead of storing now, which would forget about the time passed since the end of the last render. Then when we are finally not busy rendering audio, we make sure to cap the number of samples at the audio buffer size, then recalculate passed to limit it to rendering the most recent amount of audio that will fit in the buffer (1 sec). 

ChatGPT:

Yes, that's a good point. You're essentially establishing a "retrospective" time frame from which to create your audio data when the GPU is no longer busy.

By setting nextTime = now - passed, you are essentially saying, "Let's remember the moment when this time slice began." This sets up the initial point from where you want to render audio next time when GPU is free.

Then, when you are no longer busy rendering audio (when pumpingAudio is false), you calculate the samples and limit it to the audioBufferLength (if necessary). If you have more samples than your buffer can accommodate, you limit the samples to audioBufferLength and adjust passed accordingly. This way, you ensure that you are rendering the most recent data that will fit into the buffer.

This approach is reasonable since it prioritizes the most recent audio data, discards older data that couldn't be processed in time, and keeps the audio buffer from being overloaded.

In short, your approach for managing and maintaining synchronization seems robust, considering the potential time delays due to the async operations and the fixed size of the audio buffer.

*/

////////////////////////////////////////////////////////////////////////
// Imports

import {
    createShaderModule, createUniformFloatBuffer, createStorageFloatBuffer,
    createStoragePixelsBuffer, createBindGroupLayout, createBindGroup,
    createPipelineLayout, createComputePipeline, createRenderPipeline,
    performResetPass
} from './WebGPU.js';

import renderAudioShaderSource from './WebGPURenderAudio.wgsl?raw';

////////////////////////////////////////////////////////////////////////
// Globals, Constants, and Parameters.

let audioSampleRate;
let audioContext = null;
let audioBufferLength = 0;
let audioBufferLeft;
let audioBufferRight;
let voiceBufferLength;
let voiceIndexBufferLength;
let voiceCount = 16;
let voiceDuration = 0.25;
let voiceFrequencyStep = 100.0;
let voiceFrequencyMin = 800.0;
let voiceLeftArray;
let voiceRightArray;
let voiceIndexArray;
let pumpingAudio = false;
let pumpingPromise = Promise.resolve();
let nextTime = null;

////////////////////////////////////////////////////////////////////////
// WebGPU

let adapter;
let gpu;
let groupSize = 256;
let simulationFrequency = 60;
let simulationPeriod = 1000 / simulationFrequency;
let ticks = 0.0;
let now = 0.0;
let passed = 0.0;
let timePassed = false;
let audioWorkgroups = Math.ceil(audioBufferLength / groupSize);

////////////////////////////////////////////////////////////////////////
// WebAudio Utilities

// This function generates audio data for the time elapsed since the last tick.
function generateAudioForElapsedTime(elapsedTime) {
    // Determine how many samples to generate.
    const samplesToGenerate = Math.floor(elapsedTime / 1000 * audioSampleRate);

    if (samplesToGenerate < 1) {
        return 0;
    }

    // Generate the samples and add them to the buffer.
    for (let i = 0; i < samplesToGenerate; i++) {
        const time = i / audioSampleRate;
        audioBufferLeft[i] = Math.sin(2 * Math.PI * simulationFrequency * time);  // Left channel.
        audioBufferRight[i] = Math.cos(2 * Math.PI * simulationFrequency * time);  // Right channel.
    }

    return samplesToGenerate;
}

// This function sets up the audio context and feeds it with audio data.
function playChunk(samplesToGenerate) {

    if (samplesToGenerate < 1) {
        return;
    }

    // Create an empty stereo buffer at the sample rate of the AudioContext.
    const audioBuffer = audioContext.createBuffer(2, samplesToGenerate, audioContext.sampleRate);

    // Fill the buffer with the generated samples.
    audioBuffer.copyToChannel(audioBufferLeft, 0); // XXX
    audioBuffer.copyToChannel(audioBufferRight, 1); // XXX

    // Create a buffer source and connect it to the destination (speakers).
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();
}

// This is called by the timer event that fires every simulation period.
function tickAudio(elapsedTime) {
    // Generate the audio for this time.
    const samplesToGenerate =
          generateAudioForElapsedTime(elapsedTime);

    // Play the generated audio.
    playChunk(samplesToGenerate);
}

function startAudio() {
    audioContext = new AudioContext();
    audioSampleRate = new AudioContext().sampleRate;
    audioBufferLength = audioSampleRate;
    audioBufferLeft = new Float32Array(audioBufferLength);
    audioBufferRight = new Float32Array(audioBufferLength);
}

function loadVoices() {
    const voiceSampleLength = voiceDuration * audioSampleRate;
    voiceBufferLength = voiceCount * voiceSampleLength;
    voiceIndexBufferLength = voiceCount;
    voiceLeftArray  = new Float32Array(voiceBufferLength);
    voiceRightArray = new Float32Array(voiceBufferLength);
    voiceIndexArray = new Float32Array(voiceCount * 2);

    for (let i = 0; i < voiceCount; i++) {
        let offset = voiceSampleLength * i;
        let frequency = voiceFrequencyMin + (i * voiceFrequencyStep);
        for (let sample = 0; sample < voiceSampleLength; sample++) {

            const time = sample / audioSampleRate;
            const phase = frequency * 2.0 * Math.PI * time;
            const amp = 1.0 - (sample / voiceSampleLength);

            var left  = Math.sin(phase) * amp;
            var right = Math.cos(phase) * amp;

            if (sample < 0.1 * voiceSampleLength) {
                left *= Math.random();
                right *= Math.random();
            }
            voiceLeftArray [offset + sample]  = left;
            voiceRightArray[offset + sample] = right;
            voiceIndexArray[(i * 2) + 0] = offset;
            voiceIndexArray[(i * 2) + 1] = voiceSampleLength;
        }
    }

}

/////////////////////////////////////////////////////////
// Exported mount and unmount functions.

export async function mount(canvas, data) {

    if (!canvas) {
        console.log('Canvas missing!');
        alert('Canvas missing!');
        return;
    }

    agentCount = data.agentCount || 1000;
    groupSize = data.groupSize || 256;
    simulationFrequency = data.simulationFrequency || 60;
    simulationPeriod = 1000 / simulationFrequency;
    ticks = 0.0;
    now = Date.now();
    passed = 0.0;
    timePassed = false;
    
    ////////////////////////////////////////////////////////////////////////
    // Initial setup

    adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
        console.log('WebGPU not enabled!');
        alert('WebGPU not enabled!');
        return;
    }

    gpu = await adapter.requestDevice();

    if (!gpu) {
        console.log('WebGPU device missing!');
        alert('WebGPU device missing!');
        return;
    }

    const agentsVoiceDataBuffer = createStorageFloatBuffer(gpu, 4, agentCount); // voice data: index=x, startTime=y, speed=z
    const agentsVoiceGainDelayBuffer = createStorageFloatBuffer(gpu, 4, agentCount); // voice gain=xy and delay=zw

    const sampleSpacing = 0.1;
    const agentsVoiceData = new Float32Array();
    const agentsVoiceGainDelay = new Float32Array();
    for (let i = 0; i < agentCount; i++) {
        agentsVoiceData.push(i % voiceCount); // voice index
        agentsVoiceData.push(now + (i * sampleSpacing)); // voice start time
        agentsVoiceData.push(1.0); // voice speed
        agentsVoiceData.push(0.0); // dummy
        agentsVoiceGainDelay.push(1.0); // voice gain left
        agentsVoiceGainDelay.push(1.0); // voice gain right
        agentsVoiceGainDelay.push(0.0); // voice delay left
        agentsVoiceGainDelay.push(0.0); // voice delay right
    }

    gpu.queue.writeBuffer(agentsVoiceDataBuffer, 0, agentsVoiceData);
    gpu.queue.writeBuffer(agentsVoiceGainDelayBuffer, 0, agentsVoiceGainDelay);

    const renderAudio = 
        initializeAudio(canvas, gpu, agentCount, agentsVoiceDataBuffer, agentsVoiceGainDelayBuffer, {});
    
    function draw() {

        const lastnow = now;
        now = Date.now() / 1000;

        if (timePassed) {
            passed = now - lastnow;
        } else {
            passed = 0;
            timePassed = true;
        }

        renderAudio(ticks, now, passed);

        // Finally advance the tick.
        ticks++;

        window.setTimeout(draw, simulationPeriod);
    };

    draw();
}

export async function destroy() {
    shutdownAudio();
}

export async function initializeAudio(canvas, gpu, agentCount, agentsVoiceDataBuffer, agentsVoiceGainDelayBuffer, data) {

    if (!canvas) {
        console.log('Canvas missing!');
        alert('Canvas missing!');
        return;
    }

    if (!gpu) {
        console.log('WebGPU device missing!');
        alert('WebGPU device missing!');
        return;
    }

    startAudio();

    groupSize = data.groupSize || 256;
    simulationFrequency = data.simulationFrequency || 60;
    simulationPeriod = 1000 / simulationFrequency;
    ticks = 0.0;
    now = Date.now();
    passed = 0.0;
    timePassed = false;
    audioWorkgroups = Math.ceil(audioBufferLength / groupSize);

    ////////////////////////////////////////////////////////////////////////
    // Shaders

    const renderAudioShader = await createShaderModule(gpu, renderAudioShaderSource);

    ////////////////////////////////////////////////////////////////////////
    // Buffers, BindGroupLayouts, and BindGroups

    // First need to load voices to define voice measurements: voiceBufferLength, voiceIndexBufferLength.
    loadVoices();

    ////////////////////////////////////////////////////////////////////////
    // Audio Storage

    // audio: lr=x,y
    const audioBuffer = createStorageFloatBuffer(gpu, 2, audioBufferLength + voiceBufferLength);

    // audio voice index: offset=x, length=y
    const audioVoiceIndexBuffer = createStorageFloatBuffer(gpu, 2, voiceIndexBufferLength);

    ////////////////////////////////////////////////////////////////////////
    // BindGroupLayouts and BindGroups

    const audioBindGroupResources = [
        {buffer: audioBuffer},
        {buffer: audioVoiceIndexBuffer},
        {buffer: agentsVoiceDataBuffer},
        {buffer: agentsVoiceGainDelayBuffer},
    ];
    const audioBindGroupLayout = createBindGroupLayout(gpu, audioBindGroupResources.length, "storage");
    const audioBindGroup = createBindGroup(gpu, audioBindGroupResources, audioBindGroupLayout);

    ////////////////////////////////////////////////////////////////////////
    // Audio Uniforms

    const ticksBuffer             = createUniformFloatBuffer(gpu, 1, 1);
    const nowBuffer               = createUniformFloatBuffer(gpu, 1, 1);
    const passedBuffer            = createUniformFloatBuffer(gpu, 1, 1);
    const audioBufferLengthBuffer = createUniformFloatBuffer(gpu, 1, 1);
    const audioSampleRateBuffer   = createUniformFloatBuffer(gpu, 1, 1);
    const agentCountBuffer        = createUniformFloatBuffer(gpu, 1, 1);
    const samplesBuffer           = createUniformFloatBuffer(gpu, 1, 1);

    const audioUniformsResources = [
        {buffer: ticksBuffer},
        {buffer: nowBuffer},
        {buffer: passedBuffer},
        {buffer: audioBufferLengthBuffer},
        {buffer: audioSampleRateBuffer},
        {buffer: agentCountBuffer},
        {buffer: samplesBuffer},
    ];
    const audioUniformsBindGroupLayout = createBindGroupLayout(gpu, audioUniformsResources.length, "uniform");
    const audioUniformsBindGroup = createBindGroup(gpu, audioUniformsResources, audioUniformsBindGroupLayout);

    ////////////////////////////////////////////////////////////////////////
    // BindGroup and Layout Lists

    // Audio
    const audioBindGroups = [
        audioBindGroup,
        audioUniformsBindGroup,
    ];
    const audioBindGroupLayouts = [
        audioBindGroupLayout,
        audioUniformsBindGroupLayout,
    ];

    ////////////////////////////////////////////////////////////////////////
    // Pipeline Layouts

    const audioPipelineLayout  = createPipelineLayout(gpu, audioBindGroupLayouts);

    ////////////////////////////////////////////////////////////////////////
    // Pipelines

    const resetAudioPipeline  = createComputePipeline(gpu, audioPipelineLayout,      renderAudioShader, "resetAudio");
    const renderAudioPipeline = createComputePipeline(gpu, audioPipelineLayout,      renderAudioShader, "renderAudio");

    ////////////////////////////////////////////////////////////////////////
    // Write and Reset Functions

    function writeUniforms(ticks, now, passed, agentCount, samples) {
        gpu.queue.writeBuffer(ticksBuffer, 0, new Float32Array([ticks]));
        gpu.queue.writeBuffer(nowBuffer, 0, new Float32Array([now]));
        gpu.queue.writeBuffer(passedBuffer, 0, new Float32Array([passed]));
        gpu.queue.writeBuffer(audioBufferLengthBuffer, 0, new Float32Array([audioBufferLength]));
        gpu.queue.writeBuffer(audioSampleRateBuffer, 0, new Float32Array([audioSampleRate]));
        gpu.queue.writeBuffer(agentCountBuffer, 0, new Float32Array([agentCount]));
        gpu.queue.writeBuffer(samplesBuffer, 0, new Float32Array([samples]));
    }
    
    function resetAudio() {
        performResetPass(gpu, resetAudioPipeline,  audioWorkgroups,  audioBindGroups);
    }

    ////////////////////////////////////////////////////////////////////////
    // Initialize and Reset

    writeUniforms();

    resetAudio();

    ////////////////////////////////////////////////////////////////////////
    // Run the sim compute function and render pixels.

    function renderAudio(ticks, now, passed) {

        if (pumpingAudio) {

            if (nextTime === null) {
                nextTime = now - passed;
            }

            return;

        }

        if (nextTime !== null) {
            passed = now - nextTime;
            now = now - passed;
            nextTime = null;
        }

        let samples =
            Math.ceil(passed * audioSampleRate);

        if (samples < 1) {
            return;
        }

        if (samples > audioBufferLength) {
            samples = audioBufferLength;
            passed = samples / audioSampleRate;
        }

        audioWorkgroups = Math.ceil(samples / groupSize)

        writeUniforms(ticks, now, passed, agentCount, samples);

        // Compute the simulation and render the pixels.

        console.log(`WebGPURenderAudio.js: ticks: ${ticks} now: ${now} passed: ${passed} audioBufferLength: ${audioBufferLength} audioSampleRate: ${audioSampleRate} agentCount: ${agentCount} samples: ${samples} audioWorkgroups: ${audioWorkgroups}`);

        // Render the audio.

        const audioEncoder = gpu.createCommandEncoder();
        const audioPass = audioEncoder.beginComputePass();

        audioPass.setPipeline(renderAudioPipeline);
        audioPass.setBindGroup(0, audioBindGroup);
        audioPass.setBindGroup(1, audioUniformsBindGroup);
        audioPass.dispatchWorkgroups(audioWorkgroups);

        audioPass.end();
        gpu.queue.submit([audioEncoder.finish()]);

        // Copy out the audio from GPU to CPU.

        pumpingAudio = true;
        nextTime = null;

        pumpingPromise = pumpingPromise.then(async () => {

            // 1. Read back data from GPU
            const gpuReadBuffer = gpu.createBuffer({
                size: audioBuffer.byteLength,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });

            const copyEncoder = gpu.createCommandEncoder();

            copyEncoder.copyBufferToBuffer(
                audioBuffer,
                0,
                gpuReadBuffer,
                0,
                samples
            );
        
            const copyCommands = copyEncoder.finish();
            gpu.queue.submit([copyCommands]);
        
            await gpuReadBuffer.mapAsync(GPUMapMode.READ);
        
            const float32Array = new Float32Array(gpuReadBuffer.getMappedRange());
        
            const audioBufferLeft = float32Array.slice(0, float32Array.length / 2);
            const audioBufferRight = float32Array.slice(float32Array.length / 2);
        
            // 2. Create an AudioBuffer, fill it with the computed data, and play it.
            const audioBuffer = audioContext.createBuffer(2, audioBufferLeft.length, audioContext.sampleRate);
        
            audioBuffer.copyToChannel(audioBufferLeft, 0);
            audioBuffer.copyToChannel(audioBufferRight, 1);
        
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start();

            pumpingAudio = false;
            nextTime = null;

        }).catch(error => {
            console.error("An error occurred while playing audio: ", error);
            pumpingAudio = false;
            nextTime = null;
        });
        
        // Finally advance the tick.
        ticks++;
    };

    return renderAudio;
}


export async function shutdownAudio() {
}

////////////////////////////////////////////////////////////////////////
