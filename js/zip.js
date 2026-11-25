/* Vytvoření ZIP souboru bez knihoven (bez komprese – fotky a videa už zkomprimované jsou). */
(function () {
  const TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    TABLE[n] = c >>> 0;
  }
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const dosTime = d => (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = d => ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();

  /** files: [{ name, blob, date? }] → Blob */
  async function create(files) {
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = new TextEncoder().encode(f.name);
      const crc = crc32(new Uint8Array(await f.blob.arrayBuffer()));
      const d = f.date && !isNaN(f.date) ? f.date : new Date();
      // Část společná pro lokální i centrální hlavičku: verze, UTF-8 názvy, bez komprese, čas, CRC, velikosti.
      const common = v => {
        v.setUint16(0, 20, true); v.setUint16(2, 0x0800, true); v.setUint16(4, 0, true);
        v.setUint16(6, dosTime(d), true); v.setUint16(8, dosDate(d), true);
        v.setUint32(10, crc, true); v.setUint32(14, f.blob.size, true); v.setUint32(18, f.blob.size, true);
        v.setUint16(22, name.length, true);
      };
      const local = new ArrayBuffer(30);
      new DataView(local).setUint32(0, 0x04034b50, true);
      common(new DataView(local, 4));
      parts.push(local, name, f.blob);

      const cen = new ArrayBuffer(46);
      const cv = new DataView(cen);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      common(new DataView(cen, 6));
      cv.setUint32(42, offset, true);
      central.push(cen, name);
      offset += 30 + name.length + f.blob.size;
    }
    const cenSize = central.reduce((a, b) => a + b.byteLength, 0);
    const end = new ArrayBuffer(22);
    const ev = new DataView(end);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cenSize, true);
    ev.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }

  window.Zip = { create };
})();
