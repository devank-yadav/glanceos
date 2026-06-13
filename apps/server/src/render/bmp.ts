// 1-bit BMP encoder. Input is a 1-bit buffer (1 = white, 0 = black); output is
// a standard Windows BMP (bottom-up rows padded to 4 bytes, 2-colour palette),
// which is exactly what most e-paper firmwares decode.

export function encodeBmp1(bits: Uint8Array, w: number, h: number): Buffer {
  const rowBytes = Math.ceil(w / 8);
  const rowPad = (4 - (rowBytes % 4)) % 4;
  const stride = rowBytes + rowPad;
  const pixelBytes = stride * h;
  const headerSize = 14 + 40 + 8; // file header + info header + 2-colour palette
  const buf = Buffer.alloc(headerSize + pixelBytes);

  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(headerSize, 10); // offset to pixel data

  buf.writeUInt32LE(40, 14); // info header size
  buf.writeInt32LE(w, 18);
  buf.writeInt32LE(h, 22); // positive height → bottom-up
  buf.writeUInt16LE(1, 26); // planes
  buf.writeUInt16LE(1, 28); // bits per pixel
  buf.writeUInt32LE(0, 30); // BI_RGB (uncompressed)
  buf.writeUInt32LE(pixelBytes, 34);
  buf.writeInt32LE(2835, 38); // 72 DPI
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(2, 46); // colours used
  buf.writeUInt32LE(2, 50); // important colours

  // palette (BGRA): index 0 = black, index 1 = white
  buf.writeUInt32LE(0x00000000, 54);
  buf.writeUInt32LE(0x00ffffff, 58);

  let off = headerSize;
  for (let y = h - 1; y >= 0; y--) {
    for (let bx = 0; bx < rowBytes; bx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit;
        if (x < w && bits[y * w + x] === 1) byte |= 0x80 >> bit;
      }
      buf[off++] = byte;
    }
    off += rowPad;
  }
  return buf;
}
