////////////////////////////////////////////////////////////////////////
// WebGPU Utilities

export async function createShaderModule(gpu, code) {
    const module = gpu.createShaderModule({ code });
    const info = await module.getCompilationInfo();

    if (info.messages.length > 0) {
        for (let message of info.messages) {
            console.warn(`${message.message}\nat line ${message.lineNum} code:\n${code}`);
        }
        throw new Error(`Could not compile code`);
    }

    return module;
};

export function createUniformFloatBuffer(gpu, dim, size) {
    return gpu.createBuffer({
        size: dim * size * 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
}

export function createStorageFloatBuffer(gpu, dim, size) {
    return gpu.createBuffer({
        size: dim * size * 4,
        usage: GPUBufferUsage.STORAGE,
    });
}

export function createStoragePixelsBuffer(gpu, width, height) {
    return gpu.createBuffer({
        size: width * height * 16,
        usage: GPUBufferUsage.STORAGE,
    });
}

export function createBindGroupLayout(gpu, resourceCount, type) {

    const bindGroupLayoutEntries = [];

    for (let binding = 0; binding < resourceCount; binding++) {

        bindGroupLayoutEntries.push({
            visibility: GPUShaderStage.COMPUTE,
            binding,
            buffer: { type },
        });

    }

    const bindGroupLayout = gpu.createBindGroupLayout({
        entries: bindGroupLayoutEntries,
    });

    return bindGroupLayout;
}

export function createBindGroup(gpu, resources, bindGroupLayout) {

    const bindGroupEntries = [];

    for (let binding = 0, n = resources.length; binding < n; binding++) {

        const resource = resources[binding];

        bindGroupEntries.push({
            binding,
            resource,
        });

    }
    
    const bindGroup = gpu.createBindGroup({
        layout: bindGroupLayout,
        entries: bindGroupEntries,
    });

    return bindGroup;
}

export function createPipelineLayout(gpu, bindGroupLayouts) {
    return gpu.createPipelineLayout({
        bindGroupLayouts,
    });
}

export function createComputePipeline(gpu, layout, module, entryPoint) {
    return gpu.createComputePipeline({
        layout,
        compute: {
            module,
            entryPoint,
        },
    });
}

export function createRenderPipeline(gpu, module) {
    return gpu.createRenderPipeline({
        layout: "auto",
        vertex: {
            module,
            entryPoint: "vert",
        },
        fragment: {
            module,
            entryPoint: "frag",
            targets: [
                {
                    format: "bgra8unorm",
                },
            ],
        },
        primitive: {
            topology: "triangle-list",
        },
    });
}

export function performResetPass(gpu, pipeline, workgroups, bindGroups) {
    const encoder = gpu.createCommandEncoder();
    const pass = encoder.beginComputePass();

    pass.setPipeline(pipeline);

    for (let binding = 0; binding < bindGroups.length; binding++) {
        pass.setBindGroup(binding, bindGroups[binding]);
    }

    pass.dispatchWorkgroups(workgroups);

    pass.end();

    gpu.queue.submit([encoder.finish()]);
}

////////////////////////////////////////////////////////////////////////
