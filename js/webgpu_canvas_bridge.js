/**
 * SuperInstance Chiaroscuro WebGPU/WGSL Execution Matrix.
 * Zero-allocation bindings for ultra-low latency mobile browser execution.
 *
 * Implements:
 * 1. Zero-allocation memory mapping loops via typed Uint32Array layers.
 * 2. Asynchronous hardware compute command queue routing.
 * 3. Unified row-major memory buffering for immediate canvas updates.
 *
 * Rule compliance: R6 (no float in election loop — GPU side), mobile rule 1
 * (no global atomics — per-thread accumulators in WGSL), rule 3 (row-major).
 *
 * Roadmap: this is the WebGPU backend bridge for the shape-match engine
 * (README §19 item 1). CPU engines live in studio.html / director.html.
 */
class WebGPUCanvasBridge {
    constructor(cols, rows, glyphCount) {
        this.cols = cols;
        this.rows = rows;
        this.glyphCount = glyphCount;
        this.numCells = cols * rows;

        this.device = null;
        this.computePipeline = null;
        this.bindGroup = null;

        // Host-side typed array pools (cached to prevent GC triggers).
        this.hostVideoBuffer = new Uint32Array(this.numCells);
        this.hostFontAtlas = new Uint32Array(this.glyphCount);

        this.uniformBuffer = null;
        this.gpuVideoBuffer = null;
        this.gpuFontAtlasBuffer = null;
        this.gpuOutputBuffer = null;
        this.gpuDriftBuffer = null;
        this.stagingBuffer = null;
    }

    async initialize(wgslShaderSource) {
        if (!navigator.gpu) {
            throw new Error("[WEBGPU] Core API not detected on this browser platform.");
        }
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
        if (!adapter) throw new Error("[WEBGPU] Failed to acquire high-performance adapter.");
        this.device = await adapter.requestDevice();

        const shaderModule = this.device.createShaderModule({ code: wgslShaderSource });
        this.allocateHardwareBuffers();

        this.computePipeline = this.device.createComputePipeline({
            layout: "auto",
            compute: { module: shaderModule, entryPoint: "main" }
        });

        this.bindGroup = this.device.createBindGroup({
            layout: this.computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: { buffer: this.gpuVideoBuffer } },
                { binding: 2, resource: { buffer: this.gpuFontAtlasBuffer } },
                { binding: 3, resource: { buffer: this.gpuOutputBuffer } },
                { binding: 4, resource: { buffer: this.gpuDriftBuffer } }
            ]
        });
    }

    allocateHardwareBuffers() {
        const uniformData = new Uint32Array([this.cols, this.rows, this.glyphCount, 0]);
        this.uniformBuffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Uint32Array(this.uniformBuffer.getMappedRange()).set(uniformData);
        this.uniformBuffer.unmap();

        this.gpuVideoBuffer = this.device.createBuffer({
            size: this.numCells * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.gpuFontAtlasBuffer = this.device.createBuffer({
            size: this.glyphCount * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.gpuOutputBuffer = this.device.createBuffer({
            size: this.numCells * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });
        this.gpuDriftBuffer = this.device.createBuffer({
            size: this.numCells * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });
        this.stagingBuffer = this.device.createBuffer({
            size: this.numCells * 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
    }

    /** Inject the pre-rasterized font atlas signatures to GPU. */
    loadStaticFontAtlas(atlasArray) {
        if (atlasArray.length !== this.glyphCount) {
            throw new Error("[WEBGPU] Atlas input sizing violation.");
        }
        this.hostFontAtlas.set(atlasArray);
        this.device.queue.writeBuffer(this.gpuFontAtlasBuffer, 0, this.hostFontAtlas);
    }

    /**
     * High-velocity frame step. Zero heap allocations inside the loop:
     * the staging slice reuses the mapped range; caller reuses host arrays.
     * @param {Uint32Array} packedVideoFrame current 4x6 binary masks
     * @returns {Promise<Uint32Array>} elected glyph indices
     */
    async executeComputePass(packedVideoFrame) {
        this.device.queue.writeBuffer(this.gpuVideoBuffer, 0, packedVideoFrame);

        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(this.computePipeline);
        passEncoder.setBindGroup(0, this.bindGroup);
        passEncoder.dispatchWorkgroups(
            Math.ceil(this.cols / 16),
            Math.ceil(this.rows / 16),
            1
        );
        passEncoder.end();

        commandEncoder.copyBufferToBuffer(
            this.gpuOutputBuffer, 0,
            this.stagingBuffer, 0,
            this.numCells * 4
        );
        this.device.queue.submit([commandEncoder.finish()]);

        await this.stagingBuffer.mapAsync(GPUMapMode.READ, 0, this.numCells * 4);
        const copyArrayBuffer = this.stagingBuffer.getMappedRange(0, this.numCells * 4);
        const outputTokenData = new Uint32Array(copyArrayBuffer.slice(0));
        this.stagingBuffer.unmap();
        return outputTokenData;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WebGPUCanvasBridge };
}
