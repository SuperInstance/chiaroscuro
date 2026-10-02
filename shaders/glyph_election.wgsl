// =====================================================================
// CHIAROSCURO CORE BIVARIATE BITWISE ELECTION SHADER
// SuperInstance — glyph election via Hamming distance on packed 24-bit
// signatures. One XOR + one POPCNT per comparison. No floats in the
// election loop (R6). Spatial drift D(x) written as f32 side channel.
//
// Roadmap item #1: the WebGPU backend for the shape-match engine.
// CPU-side Hamming elections (mirror/sculptor/studio) move to GPU here.
// =====================================================================

struct SystemUniforms {
    grid_cols: u32,
    grid_rows: u32,
    font_glyph_count: u32,
    padding: u32,
};

@group(0) @binding(0) var<uniform> uniforms : SystemUniforms;
@group(0) @binding(1) var<storage, read> video_input_buffer : array<u32>;
@group(0) @binding(2) var<storage, read> font_atlas_buffer : array<u32>;
@group(0) @binding(3) var<storage, read_write> target_output_tokens : array<u32>;
@group(0) @binding(4) var<storage, read_write> spatial_drift_metrics : array<f32>;
// Lane A: Jev-gate dirty flags — 0 = Abstain, keep previous token.
@group(0) @binding(5) var<storage, read> cell_dirty : array<u32>;

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
    let col = global_id.x;
    let row = global_id.y;

    // Boundary gate: threads outside the grid exit immediately.
    if (col >= uniforms.grid_cols || row >= uniforms.grid_rows) {
        return;
    }

    let cell_index = row * uniforms.grid_cols + col;

    // Jev Abstain skip: prior token stays resident in target_output_tokens.
    if (cell_dirty[cell_index] == 0u) {
        return;
    }

    let video_signature : u32 = video_input_buffer[cell_index];

    // Per-thread local accumulators — no global atomics (mobile rule 1).
    var minimum_hamming_distance : u32 = 9999u;
    var elected_glyph_index : u32 = 0u;
    var total_drift_energy : u32 = 0u;

    // Sequential atlas sweep: workgroup-uniform reads stay in L1 (rule 2).
    for (var g : u32 = 0u; g < uniforms.font_glyph_count; g = g + 1u) {
        let glyph_signature : u32 = font_atlas_buffer[g];
        let distance : u32 = countOneBits(video_signature ^ glyph_signature);
        total_drift_energy = total_drift_energy + distance;
        if (distance < minimum_hamming_distance) {
            minimum_hamming_distance = distance;
            elected_glyph_index = g;
        }
    }

    target_output_tokens[cell_index] = elected_glyph_index;

    // Spatial drift D(x): normalized total election energy.
    let max_possible_energy = uniforms.font_glyph_count * 24u;
    if (max_possible_energy > 0u) {
        spatial_drift_metrics[cell_index] = f32(total_drift_energy) / f32(max_possible_energy);
    } else {
        spatial_drift_metrics[cell_index] = 0.0;
    }
}
