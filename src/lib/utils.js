// utils.js

// Sizes in bytes
export const typeSizes = {
    f32: 4,
    vec2: 8,
    vec4: 16,
};

export const loadFile = async (path) => {
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

export const createShader = async (gpu, file) => {
    const code = await loadFile(file);
    const module = gpu.createShaderModule({ code });
    const info = await module.getCompilationInfo();
    if (info.messages.length > 0) {
        for (let message of info.messages) {
            console.warn(`${message.message}\nat ${file} line ${message.lineNum}`);
        }
        throw new Error(`Could not compile ${file}`);
    }
    return module;
};
    
//////////////////////////////
// render
// Render a buffer of pixels to an html canvas context
// input: device, pixel resolution, the buffer, the buffer size, the format, the context, the command encoder
// output: none
// side effect: renders the pixels to the canvas
// for more information: you can look into how vertex and fragment shaders work in opengl or any other graphics framework

let rp;

export const renderFrame = async (gpu, rez, buffer, format, context, encoder) => {
    // Call the existing function if it exists
    if (rp) {
        rp(encoder);
        return;
    }
    
    // Otherwise create the function...
    let background;
    
    if (
        window.getComputedStyle(document.body).backgroundColor ==
        "rgb(255, 255, 255)"
    ) {
        background = "vec4(1.0)";
    } else {
        background = "vec4(0.0, 0.0, 0.0, 1.0)";
    }
    
    // Vertex and fragment shaders
    let quadShader = gpu.createShaderModule({
        code: `
            @group(0) @binding(0)  
            var<storage, read_write> pixels : array<vec4<f32>>;
        
            struct VertexOutput {
                @builtin(position) Position : vec4<f32>,
                @location(0) fragUV : vec2<f32>,
            }
            
            @vertex
            fn vert(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
            
                const pos = array(
                    vec2( 1.0,  1.0),
                    vec2( 1.0, -1.0),
                    vec2(-1.0, -1.0),
                    vec2( 1.0,  1.0),
                    vec2(-1.0, -1.0),
                    vec2(-1.0,  1.0),
                );
            
                const uv = array(
                    vec2(1.0, 0.0),
                    vec2(1.0, 1.0),
                    vec2(0.0, 1.0),
                    vec2(1.0, 0.0),
                    vec2(0.0, 1.0),
                    vec2(0.0, 0.0),
                );
        
                var output : VertexOutput;

                output.Position = 
                    vec4(pos[VertexIndex], 0.0, 1.0);
                output.fragUV = 
                    uv[VertexIndex];

                return output;
            }
            
            @fragment
            fn frag(@location(0) fragUV : vec2<f32>) -> @location(0) vec4<f32> {
                var color = vec4(0, 0, 0, 1.0);
                color += pixels[i32((fragUV.x * ${rez}) + floor(fragUV.y * ${rez}) * ${rez})];
                return color;
            }
        `,
    });
    
    // Traditional render pipeline of vert -> frag
    const renderPipeline = gpu.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: quadShader,
            entryPoint: "vert",
        },
        fragment: {
            module: quadShader,
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
    
    // The only binding is the pixel buffer
    // Since we render directly to the canvas, not to an intermediate texture
    const bg = gpu.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
        {
            binding: 0,
            resource: {
                buffer: buffer,
                offset: 0,
                size: rez * rez * 16,
            },
        },
        ],
    });
    
    // Create a function that adds the render pass to the given command encoder
    rp = (commandEncoder) => {
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    view: context.getCurrentTexture().createView(),
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });

        renderPass.setPipeline(renderPipeline);
        renderPass.setBindGroup(0, bg);

        // The actual draw command
        renderPass.draw(6, 1, 0, 0);
        renderPass.end();
    };
    
    // Call the function
    rp(encoder);
};
