// WebGPUTest1-agents.wgsl

////////////////////////////////////////////////////////////////////////
// Group 0: Pixels

@group(0) @binding(0)
  var<storage, read_write> pixels : array<vec4<f32>>;
fn getPixel(i: u32) -> vec4<f32> { return pixels[i]; }
fn setPixel(i: u32, val: vec4<f32>) { pixels[i] = val; }

////////////////////////////////////////////////////////////////////////
// Group 1: Simulation Uniforms

@group(1) @binding(0)
  var<uniform> rez : f32;

@group(1) @binding(1)
  var<uniform> ticks : f32;

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

////////////////////////////////////////////////////////////////////////
// Group 2: Agents

// Agent position and velocity.
@group(2) @binding(0)
  var<storage, read_write> agentPositionsVelocities : array<vec4<f32>>;
fn getAgentPosition(i: u32) -> vec2<f32> { return agentPositionsVelocities[i].xy; }
fn setAgentPosition(i: u32, val: vec2<f32>) { agentPositionsVelocities[i] = vec4<f32>(val, agentPositionsVelocities[i].zw); }
fn getAgentVelocity(i: u32) -> vec2<f32> { return agentPositionsVelocities[i].zw; }
fn setAgentVelocity(i: u32, val: vec2<f32>) { agentPositionsVelocities[i] = vec4<f32>(agentPositionsVelocities[i].xy, val); }

// Agent color.
@group(2) @binding(1)
  var<storage, read_write> agentColors : array<vec4<f32>>;
fn getAgentColor(i: u32) -> vec4<f32> { return agentColors[i]; }
fn setAgentColor(i: u32, val: vec4<f32>) { agentColors[i] = val; }

// Agent voice index, startTime, speed.
@group(2) @binding(2)
  var<storage, read_write> agentVoiceData : array<vec4<f32>>;
fn getAgentVoiceIndex(i: u32) -> f32 { return agentVoiceData[i].x; }
fn setAgentVoiceIndex(i: u32, val: f32) { agentVoiceData[i] = vec4<f32>(val, agentVoiceData[i].yzw); }
fn getAgentVoiceStartTime(i: u32) -> f32 { return agentVoiceData[i].y; }
fn setAgentVoiceStartTime(i: u32, val: f32) { agentVoiceData[i] = vec4<f32>(agentVoiceData[i].x, val, agentVoiceData[i].zw); }
fn getAgentVoiceSpeed(i: u32) -> f32 { return agentVoiceData[i].z; }
fn setAgentVoiceSpeed(i: u32, val: f32) { agentVoiceData[i] = vec4<f32>(agentVoiceData[i].xy, val, agentVoiceData[i].w); }

// Agent voice gain, delay.
@group(2) @binding(3)
  var<storage, read_write> agentVoiceGainDelay : array<vec4<f32>>;
fn getAgentVoiceGain(i: u32) -> vec2<f32> { return agentVoiceGainDelay[i].xy; }
fn setAgentVoiceGain(i: u32, val: vec2<f32>) { agentVoiceGainDelay[i] = vec4<f32>(val, agentVoiceGainDelay[i].zw); }
fn getAgentVoiceDelay(i: u32) -> vec2<f32> { return agentVoiceGainDelay[i].zw; }
fn setAgentVoiceDelay(i: u32, val: vec2<f32>) { agentVoiceGainDelay[i] = vec4<f32>(agentVoiceGainDelay[i].xy, val); }

////////////////////////////////////////////////////////////////////////
// Utilities

fn rand(n: f32) -> f32 {
  let x = sin(n) * 43758.5453;
  //let x = sin(n + ticks + now) * 43758.5453;
  return fract(x);
}

fn index(p: vec2<f32>) -> i32 {
  return i32(p.x) + i32(p.y) * i32(rez);
}

////////////////////////////////////////////////////////////////////////
// Reset Pixels

@compute @workgroup_size(256)
fn resetPixels(@builtin(global_invocation_id) id : vec3<u32>) {
  //var seed = f32(id.x);
  //setPixel(id.x, vec4(rand(seed * 7.0), rand(seed * 8.0), rand(seed * 9.0), 1.0));
  setPixel(id.x, vec4(0.0, 0.0, 0.0, 1.0));
}

////////////////////////////////////////////////////////////////////////
// Reset Agents

@compute @workgroup_size(256)
fn resetAgents(@builtin(global_invocation_id) id : vec3<u32>) {

  var seed = f32(id.x);
  var x = rand(seed * 2.0);
  var y = rand(seed * 5.0);
  var p = vec2(x, y);

  p *= rez;

  setAgentPosition(id.x, p);

  var v =
    vec2(
      rand(seed * 87.0),
      rand(seed * 57.0)) - 0.5;

  setAgentVelocity(id.x, v);

  var r = rand(seed * 7.0);
  var g = rand(seed * 11.0);
  var b = rand(seed * 17.0);
  var c = vec4(r, g, b, 1.0);

  setAgentColor(id.x, c);
  setAgentVoiceIndex(id.x, 0.0);
  setAgentVoiceStartTime(id.x, 0.0);
  setAgentVoiceSpeed(id.x, 1.0);
  setAgentVoiceGain(id.x, vec2(1.0, 1.0));
}

////////////////////////////////////////////////////////////////////////
// runSimulation

@compute @workgroup_size(256)
fn runSimulation(@builtin(global_invocation_id) id : vec3<u32>) {

  var p = getAgentPosition(id.x);
  var v = getAgentVelocity(id.x);
  var dx = cursorx - p.x;
  var dy = cursory - p.y;
  var dist = sqrt((dx * dx) + (dy * dy));
  var ringCenter = 0.75;
  var inner = 0.4;
  var core = 0.1;
  var jiggle = 0.3;
  var boom = 6.0;
  var still = 100.0;
  var barf = -6.0;
  var innerSlurp = 0.6;
  var ringSlurp = 0.002;
  var ringNoise = 0.4;
  var ringSlow = 0.5;
  var spin = 0.8;
  var distRings = 0.1;
  var seed = f32(id.x);

  if (dist < radius) {

    if ((abs(cursorxv) < still) &&
        (abs(cursoryv) < still)) {

      // still

      var pull = 0.0;

      if (dist < (radius * inner)) {

        // Set the particle's color when it falls into the inner sanctum.

        var colorTicksScale = 0.003;
        var distTicksEntangle = 3.0;
        var rgba = vec4(
          sin((ticks + dist * distTicksEntangle * 2.7) * colorTicksScale * 1.1),
          sin((ticks + dist * distTicksEntangle * 1.6) * colorTicksScale * 1.4),
          sin((ticks + dist * distTicksEntangle * 3.4) * colorTicksScale * 1.7),
          1.0);
        setAgentColor(id.x, rgba);

        if (dist < (radius * core)) {

          // core

          v.x += (rand(f32(seed * 23.0)) - 0.5) * boom;
          v.y += (rand(f32(seed * 31.0)) - 0.5) * boom;

          pull = barf;

        } else {

          // inner

          v.x += (rand(f32(seed * 23.0)) - 0.5) * jiggle;
          v.y += (rand(f32(seed * 31.0)) - 0.5) * jiggle;

          pull = innerSlurp;

        }

      } else {

        // ring

        v *= ringSlow;

        var tw = 1.0;
        if (dist < (radius * ringCenter)) {
          tw = -1.0;
        }

        tw = cos(dist * distRings);

        var ang = atan2(-dx, dy);

        p.x += cos(ang) * spin * tw;
        p.y += sin(ang) * spin * tw;

        v.x += (rand(f32(seed * 77.0)) - 0.5) * ringNoise;
        v.y += (rand(f32(seed * 81.0)) - 0.5) * ringNoise;

        pull = ringSlurp * tw;

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

    setAgentVelocity(id.x, v);

  }

  p += v;
  p = (p + (100.0 * rez)) % rez;

  setAgentPosition(id.x, p);

  setPixel(u32(index(p)), getAgentColor(id.x));
}

@compute @workgroup_size(256)
fn runFade(@builtin(global_invocation_id) id : vec3<u32>) {

  var centerWeight = 0.3;
  var fadeWeight = 0.992;

  var rez = rez;
  var r = i32(rez);
  var i = i32(id.x);
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

  var nw = getPixel(u32(i + dx_left + dy_up * r));
  var n =  getPixel(u32(i + dy_up * r));
  var ne = getPixel(u32(i + dx_right + dy_up * r));
  var w =  getPixel(u32(i + dx_left));
  var c =  getPixel(u32(i));
  var e =  getPixel(u32(i + dx_right));
  var sw = getPixel(u32(i + dx_left + dy_down * r));
  var s =  getPixel(u32(i + dy_down * r));
  var se = getPixel(u32(i + dx_right + dy_down * r));

  var neighborColor =
    (nw + n + ne + w + e + sw + s + se) / 8.0;

  c =
    (c * centerWeight) +
    (neighborColor * (1.0 - centerWeight));

  c *= fadeWeight;

  setPixel(id.x, c);
}
