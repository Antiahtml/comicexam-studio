/**
 * Escritor mínimo de archivos RAR 5.0 con método "store" (sin compresión).
 *
 * Solo se usa para GENERAR DATOS DE PRUEBA legales (no hay herramienta libre para crear RAR).
 * Sigue la especificación técnica pública de RAR 5.0 (rarlab.com/technote.htm):
 *   firma · cabecera principal · cabeceras de archivo + datos · fin de archivo.
 * El resultado lo lee el descompresor oficial (unrar) compilado a WASM que usa la aplicación.
 */
import { crc32 } from "node:zlib";

function vint(n: number): number[] {
  const out: number[] = [];
  let v = n;
  do {
    let byte = v & 0x7f;
    v = Math.floor(v / 128);
    if (v > 0) byte |= 0x80;
    out.push(byte);
  } while (v > 0);
  return out;
}

function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

/** Bloque: CRC32 de cabecera + tamaño (vint) + datos de cabecera. */
function block(headerData: number[]): Buffer {
  const size = vint(headerData.length);
  const body = Buffer.from([...size, ...headerData]);
  const crc = crc32(body) >>> 0;
  return Buffer.concat([Buffer.from(u32(crc)), body]);
}

export interface RarEntry {
  name: string;
  data: Buffer;
}

export function createRar5Store(entries: RarEntry[]): Buffer {
  const parts: Buffer[] = [];
  // Firma RAR 5.0
  parts.push(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]));
  // Cabecera principal: tipo 1, flags 0, archive flags 0
  parts.push(block([...vint(1), ...vint(0), ...vint(0)]));
  for (const e of entries) {
    const name = Buffer.from(e.name.replace(/\\/g, "/"), "utf8");
    const dataCrc = crc32(e.data) >>> 0;
    const header = [
      ...vint(2), // tipo: archivo
      ...vint(0x0002), // flags: hay área de datos
      ...vint(e.data.length), // tamaño de datos (empaquetado)
      ...vint(0x0004), // file flags: CRC32 presente
      ...vint(e.data.length), // tamaño descomprimido
      ...vint(0x20), // atributos (archivo normal)
      ...u32(dataCrc), // CRC32 de los datos
      ...vint(0), // compresión: versión 0, método 0 = store
      ...vint(1), // sistema: Unix
      ...vint(name.length),
      ...name,
    ];
    parts.push(block(header));
    parts.push(e.data);
  }
  // Fin de archivo: tipo 5, flags 0, end flags 0
  parts.push(block([...vint(5), ...vint(0), ...vint(0)]));
  return Buffer.concat(parts);
}
