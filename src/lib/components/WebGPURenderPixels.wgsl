// WebGPURenderPixels.wgsl

@group(0)
@binding(0)

var<storage, read_write> pixels: array<vec4<f32>>;

struct VertexOutput {
    @builtin(position) Position: vec4<f32>,
    @location(0) fragUV: vec2<f32>,
}

@vertex fn vert(@builtin(vertex_index) VertexIndex: u32) -> VertexOutput {

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

    var output: VertexOutput;

    output.Position = 
        vec4(pos[VertexIndex], 0.0, 1.0);
    output.fragUV = 
        uv[VertexIndex];

    return output;
}

@fragment fn frag(@location(0) fragUV : vec2<f32>) -> @location(0) vec4<f32> {

    var color = 
        vec4(0, 0, 0, 1.0);

    color +=
        pixels[i32((fragUV.x * REZ) + floor(fragUV.y * REZ) * REZ)];
        
    return color;
}
