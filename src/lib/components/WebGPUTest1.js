////////////////////////////////////////////////////////////////////////
// WebGPUTest1.js
// Copyright (C) 2023 by Don Hopkins.
// All rights reserved.

////////////////////////////////////////////////////////////////////////
// Imports

import {
    createShaderModule, createUniformFloatBuffer, createStorageFloatBuffer,
    createStoragePixelsBuffer, createBindGroupLayout, createBindGroup,
    createPipelineLayout, createComputePipeline, createRenderPipeline,
    performResetPass,
} from './WebGPU.js';
import {
    initializeAudio, shutdownAudio,
} from './WebGPURenderAudio.js';

import renderPixelsShaderSource from './WebGPURenderPixels.wgsl?raw';
import agentsShaderSource from './WebGPUTest1-agents.wgsl?raw';

////////////////////////////////////////////////////////////////////////
// Globals, Constants, and Parameters.

////////////////////////////////////////////////////////////////////////
// WebGPU

let adapter;
let gpu;
let scale;
let context;
let rez = 512;
let agentCount = 1000000;
let groupSize = 256;
let simulationFrequency = 60;
let simulationPeriod = 1000 / simulationFrequency;
let radius = 80.0;
let strength = 0.03;
let ticks = 0.0;
let now = 0.0;
let passed = 0.0;
let cursorx = rez / 2.0;
let cursory = rez / 2.0;
let cursorxv = 0.0;
let cursoryv = 0.0;
let moved = false;
let firstMove = true;
let mousedown = false;
let curx = 0;
let cury = 0;
let timePassed = false;
let enableAudio = false;
let initializingAudio = false;
let pixelsWorkgroups = Math.ceil(rez ** 2 / groupSize);
let agentWorkgroups = Math.ceil(agentCount / groupSize);

/////////////////////////////////////////////////////////
// User Interface Utilities

function getCursorPosition(event, canvas, rez) {
    const rect = canvas.getBoundingClientRect();
    const xScale = rez / rect.width;
    const yScale = rez / rect.height;
    const x = (event.clientX - rect.left) * xScale;
    const y = (event.clientY - rect.top) * yScale;
    return { x, y };
}

function handleInput()
{
    if (!moved) {
        return;
    }

    const lastx = cursorx;
    const lasty = cursory;

    cursorx = curx;
    cursory = cury;

    if (firstMove) {

        cursorxv = 0;
        cursoryv = 0;

    } else {

        if (passed > 0) {

            // Smooth out the velocity change a lot.
            var xv = (curx - lastx) / passed;
            var yv = (cury - lasty) / passed;

            var weight = 0.1;

            cursorxv = (cursorxv * (1.0 - weight)) + (xv * weight);
            cursoryv = (cursoryv * (1.0 - weight)) + (yv * weight);

        } else {

            cursorxv = 0;
            cursoryv = 0;

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

    rez = data.rez || 512;
    agentCount = data.agentCount || 1000000;
    groupSize = data.groupSize || 256;
    simulationFrequency = data.simulationFrequency || 60;
    simulationPeriod = 1000 / simulationFrequency;
    radius = data.radius || 80.0;
    strength = data.strength || 0.03;
    ticks = 0.0;
    now = Date.now();
    passed = 0.0;
    cursorx = rez / 2.0;
    cursory = rez / 2.0;
    cursorxv = 0.0;
    cursoryv = 0.0;
    moved = false;
    firstMove = true;
    curx = 0;
    cury = 0;
    timePassed = false;
    pixelsWorkgroups = Math.ceil(rez ** 2 / groupSize);
    agentWorkgroups = Math.ceil(agentCount / groupSize);

    ////////////////////////////////////////////////////////////////////////
    // User Interface

    // Set up user interface parameters and handlers.

    canvas.addEventListener('mousemove', function(event) {
        const pos =
              getCursorPosition(
                  event,
                  canvas,
                  rez);

        if (moved) {
            firstMove = false;
        }

        moved = true;
        curx = pos.x;
        cury = pos.y;
    });

    canvas.addEventListener('mousedown', function(event) {
        mousedown = true;

        enableAudio = !enableAudio;
    });

    canvas.addEventListener('mouseup', function(event) {
        mousedown = false;
    });

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

    gpu.addEventListener('uncapturederror', (error) => {
        console.log('Uncaptured WebGPU device error:', error, error.error, "\n" + error.error.message);
    });

    scale = (0.95 * Math.min(window.innerHeight, window.innerWidth)) / rez;
    canvas.width = canvas.height = rez * scale;

    context = canvas.getContext("webgpu");

    if (!context) {
        console.log('WebGPU context missing!');
        alert('WebGPU context missing!');
        return;
    }

    context.configure({
        device: gpu,
        format: "bgra8unorm",
        alphaMode: "premultiplied",
    });

    ////////////////////////////////////////////////////////////////////////
    // Shaders

    const agentsShader = await createShaderModule(gpu, agentsShaderSource);
    const renderPixelsShader = await createShaderModule(gpu, renderPixelsShaderSource.replaceAll('REZ', rez));

    ////////////////////////////////////////////////////////////////////////
    // Render Pixels Stuff: create the pipeline early.

    const renderPixelsPipeline = createRenderPipeline(gpu, renderPixelsShader);

    ////////////////////////////////////////////////////////////////////////
    // Buffers

    ////////////////////////////////////////////////////////////////////////
    // Pixels buffer

    const pixelsBuffer = createStoragePixelsBuffer(gpu, rez, rez);

    ////////////////////////////////////////////////////////////////////////
    // Uniform buffers

    const rezBuffer               = createUniformFloatBuffer(gpu, 1, 1);
    const ticksBuffer             = createUniformFloatBuffer(gpu, 1, 1);
    const cursorxBuffer           = createUniformFloatBuffer(gpu, 1, 1);
    const cursoryBuffer           = createUniformFloatBuffer(gpu, 1, 1);
    const cursorxvBuffer          = createUniformFloatBuffer(gpu, 1, 1);
    const cursoryvBuffer          = createUniformFloatBuffer(gpu, 1, 1);
    const nowBuffer               = createUniformFloatBuffer(gpu, 1, 1);
    const passedBuffer            = createUniformFloatBuffer(gpu, 1, 1);
    const radiusBuffer            = createUniformFloatBuffer(gpu, 1, 1);
    const strengthBuffer          = createUniformFloatBuffer(gpu, 1, 1);

    ////////////////////////////////////////////////////////////////////////
    // Agents

    // agent position=xy and velocity=zw
    const agentsPositionVelocityBuffer = createStorageFloatBuffer(gpu, 4, agentCount);

    // agent color: rgb=xyz
    const agentsColorBuffer = createStorageFloatBuffer(gpu, 4, agentCount);

    // voice data: index=x, startTime=y, speed=z
    const agentsVoiceDataBuffer = createStorageFloatBuffer(gpu, 4, agentCount);

    // voice gain=xy and delay=zw
    const agentsVoiceGainDelayBuffer = createStorageFloatBuffer(gpu, 4, agentCount);

    ////////////////////////////////////////////////////////////////////////
    // BindGroupLayouts and BindGroups

    ////////////////////////////////////////////////////////////////////////
    // Pixels

    const pixelsBindGroupResources = [
        {buffer: pixelsBuffer},
    ];
    const pixelsBindGroupLayout = createBindGroupLayout(gpu, pixelsBindGroupResources.length, "storage");
    const pixelsBindGroup = createBindGroup(gpu, pixelsBindGroupResources, pixelsBindGroupLayout);

    ////////////////////////////////////////////////////////////////////////
    // Simulation Uniforms

    const simulationUniformsResources = [
        {buffer: rezBuffer},
        {buffer: ticksBuffer},
        {buffer: cursorxBuffer},
        {buffer: cursoryBuffer},
        {buffer: cursorxvBuffer},
        {buffer: cursoryvBuffer},
        {buffer: nowBuffer},
        {buffer: passedBuffer},
        {buffer: radiusBuffer},
        {buffer: strengthBuffer},
    ];
    const simulationUniformsBindGroupLayout = createBindGroupLayout(gpu, simulationUniformsResources.length, "uniform");
    const simulationUniformsBindGroup = createBindGroup(gpu, simulationUniformsResources, simulationUniformsBindGroupLayout);

    ////////////////////////////////////////////////////////////////////////
    // Agents

    const agentsBindGroupResources = [
        {buffer: agentsPositionVelocityBuffer},
        {buffer: agentsColorBuffer},
        {buffer: agentsVoiceDataBuffer},
        {buffer: agentsVoiceGainDelayBuffer},
    ];
    const agentsBindGroupLayout = createBindGroupLayout(gpu, agentsBindGroupResources.length, "storage");
    const agentsBindGroup = createBindGroup(gpu, agentsBindGroupResources, agentsBindGroupLayout);

    ////////////////////////////////////////////////////////////////////////
    // Render Pixels

    const renderPixelsResources = [
        {buffer: pixelsBuffer, offset: 0, size: rez * rez * 16},
    ];
    const renderPixelsBindGroupLayout = renderPixelsPipeline.getBindGroupLayout(0); // Get it from the render pipeline.
    const renderPixelsBindGroup = createBindGroup(gpu, renderPixelsResources, renderPixelsBindGroupLayout);

    ////////////////////////////////////////////////////////////////////////
    // Bind Group and Layout Lists

    // Simulation
    const simulationBindGroups = [
        pixelsBindGroup,
        simulationUniformsBindGroup,
        agentsBindGroup,
    ];
    const simulationBindGroupLayouts = [
        pixelsBindGroupLayout,
        simulationUniformsBindGroupLayout,
        agentsBindGroupLayout,
    ];

    // Render Pixels
    const renderPixelsBindGroups = [
        renderPixelsBindGroup,
    ];
    const renderPixelsBindGroupLayouts = [
        renderPixelsBindGroupLayout,
    ];

    ////////////////////////////////////////////////////////////////////////
    // Pipeline Layouts

    const simulationPipelineLayout = createPipelineLayout(gpu, simulationBindGroupLayouts);

    ////////////////////////////////////////////////////////////////////////
    // Pipelines

    const resetAgentsPipeline = createComputePipeline(gpu, simulationPipelineLayout, agentsShader,      "resetAgents");
    const resetPixelsPipeline = createComputePipeline(gpu, simulationPipelineLayout, agentsShader,      "resetPixels");
    const simulationPipeline  = createComputePipeline(gpu, simulationPipelineLayout, agentsShader,      "runSimulation");
    const fadePipeline        = createComputePipeline(gpu, simulationPipelineLayout, agentsShader,      "runFade");

    ////////////////////////////////////////////////////////////////////////
    // Reset Functions

    function writeUniforms() {
        gpu.queue.writeBuffer(rezBuffer, 0, new Float32Array([rez]));
        gpu.queue.writeBuffer(ticksBuffer, 0, new Float32Array([ticks]));
        gpu.queue.writeBuffer(cursorxBuffer, 0, new Float32Array([cursorx]));
        gpu.queue.writeBuffer(cursoryBuffer, 0, new Float32Array([cursory]));
        gpu.queue.writeBuffer(cursorxvBuffer, 0, new Float32Array([cursorxv]));
        gpu.queue.writeBuffer(cursoryvBuffer, 0, new Float32Array([cursoryv]));
        gpu.queue.writeBuffer(nowBuffer, 0, new Float32Array([now]));
        gpu.queue.writeBuffer(passedBuffer, 0, new Float32Array([passed]));
        gpu.queue.writeBuffer(radiusBuffer, 0, new Float32Array([radius]));
        gpu.queue.writeBuffer(strengthBuffer, 0, new Float32Array([strength])); 
    }
    
    function resetAgents() { performResetPass(gpu, resetAgentsPipeline, agentWorkgroups,  simulationBindGroups); }
    function resetPixels() { performResetPass(gpu, resetPixelsPipeline, pixelsWorkgroups, simulationBindGroups); }

    ////////////////////////////////////////////////////////////////////////
    // Initialize and Reset

    var renderAudio = null;

    writeUniforms();

    resetAgents();
    resetPixels();

    ////////////////////////////////////////////////////////////////////////
    // Run the sim compute function and render pixels.

    function draw() {
        const lastnow = now;
        now = Date.now() / 1000;

        if (timePassed) {
            passed = now - lastnow;
        } else {
            passed = 0;
            timePassed = true;
        }

        handleInput();
        writeUniforms();

        // Compute the simulation and render the pixels.

        const simulationEncoder = gpu.createCommandEncoder();
        const simulationPass = simulationEncoder.beginComputePass();

        simulationPass.setPipeline(fadePipeline);
        simulationPass.setBindGroup(0, pixelsBindGroup);
        simulationPass.setBindGroup(1, simulationUniformsBindGroup);
        simulationPass.setBindGroup(2, agentsBindGroup);
        simulationPass.dispatchWorkgroups(pixelsWorkgroups);

        simulationPass.setPipeline(simulationPipeline);
        simulationPass.setBindGroup(0, pixelsBindGroup);
        simulationPass.setBindGroup(1, simulationUniformsBindGroup);
        simulationPass.setBindGroup(2, agentsBindGroup);
        simulationPass.dispatchWorkgroups(agentWorkgroups);

        simulationPass.end();
        gpu.queue.submit([simulationEncoder.finish()]);

        // Render the pixels buffer to the canvas.

        const renderEncoder = gpu.createCommandEncoder();
        const renderPass = renderEncoder.beginRenderPass({
            colorAttachments: [
                {
                    view: context.getCurrentTexture().createView(),
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });

        renderPass.setPipeline(renderPixelsPipeline);
        renderPass.setBindGroup(0, renderPixelsBindGroup);
        renderPass.draw(6, 1, 0, 0);

        renderPass.end();
        gpu.queue.submit([renderEncoder.finish()]);

        if (enableAudio) {
            if (!renderAudio && !initializingAudio) {

                initializingAudio = true;

                const renderAudioPromise =
                    initializeAudio(
                        canvas,
                        gpu,
                        agentCount,
                        agentsVoiceDataBuffer,
                        agentsVoiceGainDelayBuffer, 
                        {});

                renderAudioPromise.then(result => {
                    renderAudio = result;
                    initializingAudio = false;
                    console.log('Audio initialized.');
                }).catch(error => {
                    console.error(error);
                });

            } else if (renderAudio) {
                renderAudio(ticks, now, passed);
            }
        }

        // Finally advance the tick.
        ticks++;

        window.setTimeout(draw, simulationPeriod);
    }

    draw();

}

export async function destroy() {
}

////////////////////////////////////////////////////////////////////////
