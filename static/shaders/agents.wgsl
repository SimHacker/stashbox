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

  var x = rand(f32(id.x) * 2);
  var y = rand(f32(id.x) * 5);
  var p = vec2(x, y);

  p *= rez;
  positions[id.x] = p;

  var r = rand(f32(id.x) * 7);
  var g = rand(f32(id.x) * 11);
  var b = rand(f32(id.x) * 17);
  var c = vec4(r, g, b, 1.0);

  colors[id.x] = c;

  velocities[id.x] = vec2(rand(f32(id.x + 1)), rand(f32(id.x + 2))) - 0.5;
}

@compute @workgroup_size(256)
fn simulate(@builtin(global_invocation_id) id : vec3<u32>) {
  var p = positions[id.x];
  var v = velocities[id.x];

  var dx = cursorx - p.x;
  var dy = cursory - p.y;
  var dist = sqrt((dx * dx) + (dy * dy));
  var ringCenter = 0.75;
  var inner = 0.5;
  var core = 0.1;
  var jiggle = 0.1;
  var boom = 5.0;
  var still = 10.0;
  var barf = -2.0;
  var innerSlurp = 0.2;
  var ringSlurp = 0.004;
  var ringSlow = 0.5;
  var spin = 0.8;

  if (dist < radius) {

    if ((abs(cursorxv) < still) && 
        (abs(cursoryv) < still)) {

      // still

      var pull = 0.0;

      if (dist < (radius * inner)) {

        if (dist < (radius * core)) {

          // core

          v.x += (rand(f32(f32(id.x) * 23.0)) - 0.5) * boom;
          v.y += (rand(f32(f32(id.x) * 31.0)) - 0.5) * boom;

          pull = barf;

        } else {

          // inner

          v.x += (rand(f32(f32(id.x) * 23.0)) - 0.5) * jiggle;
          v.y += (rand(f32(f32(id.x) * 31.0)) - 0.5) * jiggle;

          pull = innerSlurp;

        }

      } else {

        // ring

        v *= ringSlow;

        var tw = 1.0;
        if (dist < (radius * ringCenter)) {
          tw = -1.0;
        }

        var ang = atan2(-dx, dy);

        p.x += cos(ang) * spin * tw;
        p.y += sin(ang) * spin * tw;

        pull = ringSlurp;

      }

      // pull towards center

      var cdx = cursorx - p.x;
      var cdy = cursory - p.y;
      p.x += cdx * pull;
      p.y += cdy * pull;


    } else {

      // moving

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
  var i = i32(id.x);
  var r = i32(rez);
  var x = i / r;
  var y = i % r;

  var dx_left = i32(-1);
  if ((x + dx_left) == 0) { dx_left = r - 1; }

  var dx_right = i32(1);
  if ((x + dx_right) == r) { dx_right = 1 - r; }

  var dy_up = i32(-1);
  if ((y + dy_up) == 0) { dy_up = r - 1; }

  var dy_down = i32(1);
  if ((y + dy_down) == r) { dy_down = 1 - r; }

  var nw = pixels[i + dx_left + dy_up * r];
  var n = pixels[i + dy_up * r];
  var ne = pixels[i + dx_right + dy_up * r];
  var w = pixels[i + dx_left];
  var center = pixels[i];
  var e = pixels[i + dx_right];
  var sw = pixels[i + dx_left + dy_down * r];
  var s = pixels[i + dy_down * r];
  var se = pixels[i + dx_right + dy_down * r];

  var neighborColor =
    (nw + n + ne + w + e + sw + s + se) / 8.0;

  var centerWeight = 0.2;
  center =
    (center * centerWeight) +
    (neighborColor * (1.0 - centerWeight));

  center *= 0.99;

  pixels[id.x] = center;
}
