////////////////////////////////////////////////////////////////////////
// WebGPUTest0.js
// Copyright (C) 2023 by Don Hopkins.
// All rights reserved.

////////////////////////////////////////////////////////////////////////
// Includes

import renderPixelsShaderSource from './WebGPURenderPixels.wgsl';
import agentsShaderSource from './WebGPUTest0-agents.wgsl';

////////////////////////////////////////////////////////////////////////
// Globals, Constants, and Parameters.

// Simulation

// The simulation frequency, in Hz.
let simulationFrequency = 60;

// The simulation's period, in milliseconds.
let simulationPeriod = 1000 / simulationFrequency;

let agentCount = 1000000;
let groupSize = 256;

// User Interface

let canvas;

// WebGPU

// Sizes in bytes
const typeSizes = {
    f32: 4,
    vec2: 8,
    vec4: 16,
};

////////////////////////////////////////////////////////////////////////
// WebGPU Utilities

const loadFile = async (path) => {
    try {
        const response = await fetch(path);
        if (response.ok) {
            const content = await response.text();
            return content;
        } else {
            throw new Error(`Error loading: ${path}`);
        }
    } catch (error) {
        console.error(error);
    }
};

const createShader = async (gpu, code) => {
    //const code = await loadFile(file);
    const module = gpu.createShaderModule({ code });
    const info = await module.getCompilationInfo();
    if (info.messages.length > 0) {
        for (let message of info.messages) {
            console.warn(`${message.message}\nat line ${message.lineNum} code:\n{$code}`);
        }
        throw new Error(`Could not compile code`);
    }
    return module;
};

/////////////////////////////////////////////////////////
// User Interface

function getCursorPosition(canvas, event, rez) {
    const rect = canvas.getBoundingClientRect();
    const xScale = rez / rect.width;
    const yScale = rez / rect.height;
    const x = (event.clientX - rect.left) * xScale;
    const y = (event.clientY - rect.top) * yScale;
    return { x, y };
}

/////////////////////////////////////////////////////////
// Exported mount and unmount functions.

export async function mount(canvas, data) {

    let rez = data.rez || 512;

    const uniforms = {
        rez: rez,
        time: 0,
        cursorx: rez / 2,
        cursory: rez / 2,
        cursorxv: 0,
        cursoryv: 0,
        now: 0,
        passed: 0,
        radius: 80,
        strength: 0.03,
    };

    const settings = {
        scale: (0.95 * Math.min(window.innerHeight, window.innerWidth)) / uniforms.rez,
        agentCount: agentCount,
        pixelWorkgroups: Math.ceil(uniforms.rez ** 2 / groupSize),
        agentWorkgroups: Math.ceil(agentCount / groupSize),
    };

    ///////////////////////
    // Initial setup

    const adapter = 
       await navigator.gpu.requestAdapter();
    const gpu = 
       await adapter.requestDevice();

    canvas.width = canvas.height = 
        uniforms.rez * settings.scale;

    const context = 
    canvas.getContext("webgpu");
    const format =
        "bgra8unorm";

    context.configure({
        device: gpu,
        format: format,
        alphaMode: "premultiplied",
    });

    /////////////////////////
    // Set up memory resources

    const visibility =
        GPUShaderStage.COMPUTE;

    // Pixel buffer
    const pixelBuffer = gpu.createBuffer({
        size: uniforms.rez ** 2 * typeSizes.vec4,
        usage: GPUBufferUsage.STORAGE,
    });
    const pixelBufferLayout = gpu.createBindGroupLayout({
        entries: [{ visibility, binding: 0, buffer: { type: "storage" } }],
    });
    const pixelBuffersBindGroup = gpu.createBindGroup({
        layout: pixelBufferLayout,
        entries: [{ binding: 0, resource: { buffer: pixelBuffer } }],
    });

    // Uniform buffers

    // rez
    const rezBuffer = gpu.createBuffer({
    size: typeSizes.f32,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    gpu.queue.writeBuffer(rezBuffer, 0, new Float32Array([uniforms.rez]));

    // time
    const timeBuffer = gpu.createBuffer({
    size: typeSizes.f32,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    gpu.queue.writeBuffer(timeBuffer, 0, new Float32Array([uniforms.time]));

    // cursorx
    const cursorxBuffer = gpu.createBuffer({
        size: typeSizes.f32,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    gpu.queue.writeBuffer(cursorxBuffer, 0, new Float32Array([uniforms.cursorx]));

    // cursory
    const cursoryBuffer = gpu.createBuffer({
        size: typeSizes.f32,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    gpu.queue.writeBuffer(cursoryBuffer, 0, new Float32Array([uniforms.cursory]));

    // cursorxv
    const cursorxvBuffer = gpu.createBuffer({
        size: typeSizes.f32,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    gpu.queue.writeBuffer(cursorxvBuffer, 0, new Float32Array([uniforms.cursorxv]));

    // cursoryv
    const cursoryvBuffer = gpu.createBuffer({
        size: typeSizes.f32,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    gpu.queue.writeBuffer(cursoryvBuffer, 0, new Float32Array([uniforms.cursoryv]));

    // now
    const nowBuffer = gpu.createBuffer({
        size: typeSizes.f32,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    gpu.queue.writeBuffer(nowBuffer, 0, new Float32Array([uniforms.now]));

    // passed
    const passedBuffer = gpu.createBuffer({
        size: typeSizes.f32,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    gpu.queue.writeBuffer(passedBuffer, 0, new Float32Array([uniforms.passed]));

    // radius
    const radiusBuffer = gpu.createBuffer({
        size: typeSizes.f32,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    gpu.queue.writeBuffer(radiusBuffer, 0, new Float32Array([uniforms.radius]));

    // strength
    const strengthBuffer = gpu.createBuffer({
        size: typeSizes.f32,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    gpu.queue.writeBuffer(strengthBuffer, 0, new Float32Array([uniforms.strength]));

    const uniformsLayout = gpu.createBindGroupLayout({
    entries: [
        { visibility, binding: 0, buffer: { type: "uniform" } },
        { visibility, binding: 1, buffer: { type: "uniform" } },
        { visibility, binding: 2, buffer: { type: "uniform" } },
        { visibility, binding: 3, buffer: { type: "uniform" } },
        { visibility, binding: 4, buffer: { type: "uniform" } },
        { visibility, binding: 5, buffer: { type: "uniform" } },
        { visibility, binding: 6, buffer: { type: "uniform" } },
        { visibility, binding: 7, buffer: { type: "uniform" } },
        { visibility, binding: 8, buffer: { type: "uniform" } },
        { visibility, binding: 9, buffer: { type: "uniform" } },
    ],
    });

    const uniformsBuffersBindGroup = gpu.createBindGroup({
    layout: uniformsLayout,
    entries: [
        { binding: 0, resource: { buffer: rezBuffer } },
        { binding: 1, resource: { buffer: timeBuffer } },
        { binding: 2, resource: { buffer: cursorxBuffer } },
        { binding: 3, resource: { buffer: cursoryBuffer } },
        { binding: 4, resource: { buffer: cursorxvBuffer } },
        { binding: 5, resource: { buffer: cursoryvBuffer } },
        { binding: 6, resource: { buffer: nowBuffer } },
        { binding: 7, resource: { buffer: passedBuffer } },
        { binding: 8, resource: { buffer: radiusBuffer } },
        { binding: 9, resource: { buffer: strengthBuffer } },
    ],
    });

    // Other buffers

    // position
    const positionBuffer = gpu.createBuffer({
        size: typeSizes.vec2 * settings.agentCount,
        usage: GPUBufferUsage.STORAGE,
    });

    // velocity
    const velocityBuffer = gpu.createBuffer({
        size: typeSizes.vec2 * settings.agentCount,
        usage: GPUBufferUsage.STORAGE,
    });

    // color
    const colorBuffer = gpu.createBuffer({
        size: typeSizes.vec4 * settings.agentCount,
        usage: GPUBufferUsage.STORAGE,
    });
    
    // agents
    const agentsLayout = gpu.createBindGroupLayout({
        entries: [
            { visibility, binding: 0, buffer: { type: "storage" } },
            { visibility, binding: 1, buffer: { type: "storage" } },
            { visibility, binding: 2, buffer: { type: "storage" } },
        ],
    });

    const agentsBuffersBindGroup = gpu.createBindGroup({
        layout: agentsLayout,
        entries: [
            { binding: 0, resource: { buffer: positionBuffer } },
            { binding: 1, resource: { buffer: velocityBuffer } },
            { binding: 2, resource: { buffer: colorBuffer } },
        ],
    });

    // Overall memory layout.

    const layout = gpu.createPipelineLayout({
        bindGroupLayouts: [
            pixelBufferLayout,
            uniformsLayout,
            agentsLayout,
            //audioBufferLayout,
        ],
    });

    // Set up shaders,

    const agentsShader = await createShader(
        gpu, 
        agentsShaderSource);

    const resetAgentsPipeline = gpu.createComputePipeline({
        layout,
        compute: { module: agentsShader, entryPoint: "resetAgents" },
    });

    const resetPixelsPipeline = gpu.createComputePipeline({
        layout,
        compute: { module: agentsShader, entryPoint: "resetPixels" },
    });

    const simulatePipeline = gpu.createComputePipeline({
        layout,
        compute: { module: agentsShader, entryPoint: "runSimulate" },
    });

    const fadePipeline = gpu.createComputePipeline({
        layout,
        compute: { module: agentsShader, entryPoint: "runFade" },
    });

    // Vertex and fragment shaders.

    let source =
        renderPixelShaderSource.replaceAll('REZ', uniforms.rez);
    //console.log(source);

    let renderPixelsShader = await createShader(
        gpu,
        source);

    const renderPixelsPipeline = gpu.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: renderPixelsShader,
            entryPoint: "vert",
        },
        fragment: {
            module: renderPixelsShader,
            entryPoint: "frag",
            targets: [
                {
                    format: format,
                },
            ],
        },
        primitive: {
            topology: "triangle-list",
        },
    });

    // The only binding is the pixel buffer.
    // Since we render directly to the canvas, not to an intermediate texture.
    const renderPixelsBindGroup = gpu.createBindGroup({
        layout: renderPixelsPipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: pixelBuffer,
                    offset: 0,
                    size: uniforms.rez * uniforms.rez * 16,
                },
            },
        ],
    });

    const resetAgents = () => {
        const encoder = gpu.createCommandEncoder();
        const pass = encoder.beginComputePass();

        pass.setBindGroup(0, pixelBuffersBindGroup);
        pass.setBindGroup(1, uniformsBuffersBindGroup);
        pass.setBindGroup(2, agentsBuffersBindGroup);

        pass.setPipeline(resetAgentsPipeline);
        pass.dispatchWorkgroups(settings.agentWorkgroups);

        pass.end();
        gpu.queue.submit([encoder.finish()]);
    };

    const resetPixels = () => {
        const encoder = gpu.createCommandEncoder();
        const pass = encoder.beginComputePass();

        pass.setBindGroup(0, pixelBuffersBindGroup);
        pass.setBindGroup(1, uniformsBuffersBindGroup);
        pass.setBindGroup(2, agentsBuffersBindGroup);

        pass.setPipeline(resetPixelsPipeline);
        pass.dispatchWorkgroups(settings.pixelWorkgroups);

        pass.end();
        gpu.queue.submit([encoder.finish()]);
    };

    // Set up user interface handlers.

    let moved = false;
    let first_move = true;
    let curx = 0;
    let cury = 0;
    let time_passed = false;
    let now = 0;
    let passed = 0;

    canvas.addEventListener('mousemove', function(event) {
        const pos =
              getCursorPosition(
                  canvas,
                  event,
                  uniforms.rez);

        if (moved) {
            first_move = false;
        }

        moved = true;
        curx = pos.x;
        cury = pos.y;
    });

    // Run the reset shader functions.

    resetAgents();
    resetPixels();

    // Run the sim compute function and render pixels.

    const draw = () => {

        const lastnow = now;
        now = Date.now() / 1000;

        if (time_passed) {
            passed = now - lastnow;
        } else {
            passed = 0;
            time_passed = true;
        }

        uniforms.now = now;
        uniforms.passed = passed;

        // Handle input.

        if (moved) {
            const lastx = uniforms.cursorx;
            const lasty = uniforms.cursory;
            uniforms.cursorx = curx;
            uniforms.cursory = cury;
            if (first_move) {
                uniforms.cursorxv = 0;
                uniforms.cursoryv = 0;
            } else {
                if (passed > 0) {
                    // Smooth out the velocity change a lot.
                    var weight = 0.1;
                    var xv = (curx - lastx) / passed;
                    var yv = (cury - lasty) / passed;
                    uniforms.cursorxv = (uniforms.cursorxv * (1.0 - weight)) + (xv * weight);
                    uniforms.cursoryv = (uniforms.cursoryv * (1.0 - weight)) + (yv * weight);
                } else {
                    uniforms.cursorxv = 0;
                    uniforms.cursoryv = 0;
                }
            }
        }

        gpu.queue.writeBuffer(timeBuffer, 0, new Float32Array([uniforms.time++]));
        gpu.queue.writeBuffer(cursorxBuffer, 0, new Float32Array([uniforms.cursorx]));
        gpu.queue.writeBuffer(cursoryBuffer, 0, new Float32Array([uniforms.cursory]));
        gpu.queue.writeBuffer(cursorxvBuffer, 0, new Float32Array([uniforms.cursorxv]));
        gpu.queue.writeBuffer(cursoryvBuffer, 0, new Float32Array([uniforms.cursoryv]));
        gpu.queue.writeBuffer(nowBuffer, 0, new Float32Array([uniforms.now]));
        gpu.queue.writeBuffer(passedBuffer, 0, new Float32Array([uniforms.passed]));
        gpu.queue.writeBuffer(radiusBuffer, 0, new Float32Array([uniforms.radius]));
        gpu.queue.writeBuffer(strengthBuffer, 0, new Float32Array([uniforms.strength]));

        // Compute sim function

        const encoder = gpu.createCommandEncoder();
        const pass = encoder.beginComputePass();

        pass.setBindGroup(0, pixelBuffersBindGroup);
        pass.setBindGroup(1, uniformsBuffersBindGroup);
        pass.setBindGroup(2, agentsBuffersBindGroup);

        pass.setPipeline(fadePipeline);
        pass.dispatchWorkgroups(settings.pixelWorkgroups);

        pass.setPipeline(simulatePipeline);
        pass.dispatchWorkgroups(settings.agentWorkgroups);

        pass.end();

        // Render the pixels buffer to the canvas

        const renderPixelsPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: context.getCurrentTexture().createView(),
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });

        renderPixelsPass.setPipeline(renderPixelsPipeline);
        renderPixelsPass.setBindGroup(0, renderPixelsBindGroup);

        // The actual draw command
        renderPixelsPass.draw(6, 1, 0, 0);
        renderPixelsPass.end();

        gpu.queue.submit([encoder.finish()]);
        
        setTimeout(draw, simulationPeriod);
    };

    draw();
}


export async function destroy() {
}

////////////////////////////////////////////////////////////////////////
