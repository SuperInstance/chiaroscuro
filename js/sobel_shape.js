/*
 * sobel_shape.js — bivariate descriptor upgrade (Sobel L,θ,g) per canon §B.
 * Lane B. Standalone module; webgpu.html integration gated on the
 * pre-registered agreement threshold in receipts/lane-b-sobel.md.
 *
 * Descriptor per 4x6 cell:
 *   - plain luma signature (24 threshold bits)     — baseline
 *   - Sobel: gx,gy over the 480x360 gray field (3x3 Kx/Ky), g=sqrt(gx²+gy²),
 *     θ=atan2(gy,gx) binned to 16 orientations
 *   - orientation-gated election: only glyphs whose own Sobel descriptor
 *     shares the cell's orientation bin enter the Hamming sweep; fallback
 *     to full sweep when the bin subset is empty.
 */
(function (global) {
  'use strict';

  var KX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
  var KY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]; // transpose of Kx

  function sobelKernels() { return { KX: KX, KY: KY }; }

  /** gray: Float/Uint8 array row-major w*h. Returns {gx,gy,g,theta}. */
  function sobelAt(gray, w, h, x, y) {
    var gx = 0, gy = 0;
    for (var ky = -1; ky <= 1; ky++) {
      for (var kx = -1; kx <= 1; kx++) {
        var xx = x + kx, yy = y + ky;
        var v = (xx >= 0 && yy >= 0 && xx < w && yy < h) ? gray[yy * w + xx] : 0;
        gx += v * KX[ky + 1][kx + 1];
        gy += v * KY[ky + 1][kx + 1];
      }
    }
    var g = Math.sqrt(gx * gx + gy * gy);
    var theta = Math.atan2(gy, gx); // -π..π
    return { gx: gx, gy: gy, g: g, theta: theta };
  }

  /** θ (-π..π) → 16 bins, bin 0 = (-π,-7π/8], …, bin 15 = (7π/8, π]. */
  function orientationBin(theta) {
    var t = theta + Math.PI;              // 0..2π
    var b = Math.floor(t / (2 * Math.PI / 16));
    return b > 15 ? 15 : b;
  }

  /**
   * descriptorForCell — one 4x6 cell at cell grid (cellX, cellY).
   * gray: w*h luma field (0..1). Returns {luma24, bin, g, meanG}.
   * bin = circular mean orientation of the 24 subpixel gradients,
   * g = mean gradient magnitude (edge strength).
   */
  function descriptorForCell(gray, w, h, cellX, cellY, subW, subH) {
    subW = subW || 4; subH = subH || 6;
    var sumSin = 0, sumCos = 0, sumG = 0;
    var x0 = cellX * subW, y0 = cellY * subH;
    for (var sy = 0; sy < subH; sy++) {
      for (var sx = 0; sx < subW; sx++) {
        var s = sobelAt(gray, w, h, x0 + sx, y0 + sy);
        sumG += s.g;
        sumSin += Math.sin(s.theta) * s.g; // magnitude-weighted circular mean
        sumCos += Math.cos(s.theta) * s.g;
      }
    }
    var theta = Math.atan2(sumSin, sumCos);
    return {
      bin: orientationBin(theta),
      g: sumG / (subW * subH),
      theta: theta
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { sobelKernels: sobelKernels, sobelAt: sobelAt,
                       orientationBin: orientationBin, descriptorForCell: descriptorForCell };
  } else {
    global.SobelShape = { sobelKernels: sobelKernels, sobelAt: sobelAt,
                          orientationBin: orientationBin, descriptorForCell: descriptorForCell };
  }
})(typeof self !== 'undefined' ? self : this);
