// WebGPURenderAudio.wgsl

////////////////////////////////////////////////////////////////////////
// Group 0: audio, audioVoice, audioVoiceIndex, agent voice index, agent voice startTime, agent voice speed

// Audio buffer at beginning, Audio Voice buffer after audioBufferLength.
@group(0) @binding(0)
  var<storage, read_write> audio : array<vec2<f32>>;
fn getAudio(i: u32) -> vec2<f32> { return audio[i]; }
fn setAudio(i: u32, val: vec2<f32>) { audio[i] = val; }
fn getAudioVoice(i: u32) -> vec2<f32> { return audio[i + u32(audioBufferLength)]; }
fn setAudioVoice(i: u32, val: vec2<f32>) { audio[i + u32(audioBufferLength)] = val; }

// Audio voice index: offset, length.
@group(2) @binding(0)
  var<storage, read_write> audioVoiceIndex : array<vec2<f32>>;
fn getVoiceOffset(i: u32) -> f32 { return audioVoiceIndex[i].x; }
fn setVoiceOffset(i: u32, val: f32) { audioVoiceIndex[i] = vec2<f32>(val, audioVoiceIndex[i].y); }
fn getVoiceLength(i: u32) -> f32 { return audioVoiceIndex[i].y; }
fn setVoiceLength(i: u32, val: f32) { audioVoiceIndex[i] = vec2<f32>(audioVoiceIndex[i].x, val); }

// Agent voice data: index, startTime, speed.
@group(2) @binding(1)
  var<storage, read_write> agentVoiceData : array<vec4<f32>>;
fn getAgentVoiceIndex(i: u32) -> f32 { return agentVoiceData[i].x; }
fn setAgentVoiceIndex(i: u32, val: f32) { agentVoiceData[i] = vec4<f32>(val, agentVoiceData[i].yzw); }
fn getAgentVoiceStartTime(i: u32) -> f32 { return agentVoiceData[i].y; }
fn setAgentVoiceStartTime(i: u32, val: f32) { agentVoiceData[i] = vec4<f32>(agentVoiceData[i].x, val, agentVoiceData[i].zw); }
fn getAgentVoiceSpeed(i: u32) -> f32 { return agentVoiceData[i].z; }
fn setAgentVoiceSpeed(i: u32, val: f32) { agentVoiceData[i] = vec4<f32>(agentVoiceData[i].xy, val, agentVoiceData[i].w); }

// Agent voice gain, delay.
@group(2) @binding(2)
  var<storage, read_write> agentVoiceGainDelay : array<vec4<f32>>;
fn getAgentVoiceGain(i: u32) -> vec2<f32> { return agentVoiceGainDelay[i].xy; }
fn setAgentVoiceGain(i: u32, val: vec2<f32>) { agentVoiceGainDelay[i] = vec4<f32>(val, agentVoiceGainDelay[i].zw); }
fn getAgentVoiceDelay(i: u32) -> vec2<f32> { return agentVoiceGainDelay[i].zw; }
fn setAgentVoiceDelay(i: u32, val: vec2<f32>) { agentVoiceGainDelay[i] = vec4<f32>(agentVoiceGainDelay[i].xy, val); }

////////////////////////////////////////////////////////////////////////
// Group 1: Audio Uniforms

@group(1) @binding(0)
  var<uniform> ticks : f32;

@group(1) @binding(1)
  var<uniform> now : f32;

@group(1) @binding(2)
  var<uniform> passed : f32;

@group(1) @binding(3)
  var<uniform> audioBufferLength : f32;

@group(1) @binding(4)
  var<uniform> audioSampleRate : f32;

@group(1) @binding(5)
  var<uniform> agentCount : f32;

@group(1) @binding(6)
  var<uniform> samples : f32;

////////////////////////////////////////////////////////////////////////
// Utilities

fn rand(n: f32) -> f32 {
  let x = sin(n) * 43758.5453;
  return fract(x);
}

////////////////////////////////////////////////////////////////////////

@compute @workgroup_size(256)
fn resetAudio(@builtin(global_invocation_id) id : vec3<u32>) {
/*
  audio[id.x] = vec2(0.0, 0.0);
*/
}

////////////////////////////////////////////////////////////////////////

@compute @workgroup_size(256)
fn renderAudio(@builtin(global_invocation_id) id : vec3<u32>) {

  if (id.x >= u32(samples)) {
    return;
  }

  var seed = f32(id.x);
  var left = (rand(seed * 7.0) - 0.5) * 2.0; // TODO
  var right = (rand(seed * 7.0) - 0.5) * 2.0; // TODO

  setAudio(id.x, vec2(left, right));
}

////////////////////////////////////////////////////////////////////////
