// Pixels
@group(0) @binding(0)  
  var<storage, read_write> pixels : array<vec4<f32>>;

// Uniforms
@group(1) @binding(0)
  var<uniform> rez : f32;

@group(1) @binding(1)
  var<uniform> time : f32;

@group(1) @binding(2)
  var<uniform> cursorx : f32;

@group(1) @binding(3)
  var<uniform> cursory : f32;

@group(1) @binding(4)
  var<uniform> cursorxv : f32;

@group(1) @binding(5)
  var<uniform> cursoryv : f32;

@group(1) @binding(6)
  var<uniform> now : f32;

@group(1) @binding(7)
  var<uniform> passed : f32;

@group(1) @binding(8)
  var<uniform> radius : f32;

@group(1) @binding(9)
  var<uniform> strength : f32;

// Agent positions
@group(2) @binding(0)  
  var<storage, read_write> positions : array<vec2<f32>>;

// Agent velocities
@group(2) @binding(1)  
  var<storage, read_write> velocities : array<vec2<f32>>;

// Agent colors
@group(2) @binding(2)  
  var<storage, read_write> colors : array<vec4<f32>>;

fn rand(n: f32) -> f32 {
  let x = sin(n) * 43758.5453;
  return fract(x);
}

fn index(p: vec2<f32>) -> i32 {
  return i32(p.x) + i32(p.y) * i32(rez);
}

@compute @workgroup_size(256)
fn reset(@builtin(global_invocation_id) id : vec3<u32>) {

  var x = rand(f32(id.x));
  var y = rand(f32(id.x) * 2);
  var p = vec2(x, y);

  p *= rez;
  positions[id.x] = p;

  var r = rand(f32(id.x) * 7);
  var g = rand(f32(id.x) * 11);
  var b = rand(f32(id.x) * 17);
  var c = vec4(r, g, b, 1.0);

  colors[id.x] = c;

  velocities[id.x] = vec2(rand(f32(id.x+1)), rand(f32(id.x + 2))) - 0.5;
}

@compute @workgroup_size(256)
fn simulate(@builtin(global_invocation_id) id : vec3<u32>) {
  var p = positions[id.x];
  var v = velocities[id.x];

  var dx = cursorx - p.x;
  var dy = cursory - p.y;
  var dist = sqrt((dx * dx) + (dy * dy));

  if (dist < radius) {

    if ((cursorxv == 0.0) && 
        (cursoryv == 0.0)) {
      v *= 0.8;
    } else {
      v.x = cursorxv * strength;
      v.y = cursoryv * strength;
    }

    velocities[id.x] = v;

    if (false) {
      var weight = 0.1;
      p.x = (p.x * (1.0 - weight) + (cursorx * weight));
      p.x = (p.y * (1.0 - weight) + (cursory * weight));
    }
  }

  //p.x = cursorx; p.y = cursory; positions[id.x] = p;

  p += v;
  p = (p + rez) % rez;

  positions[id.x] = p;

  pixels[index(p)] = colors[id.x];
}


@compute @workgroup_size(256)
fn fade(@builtin(global_invocation_id) id : vec3<u32>) {
  pixels[id.x] *= 0.97;
}
