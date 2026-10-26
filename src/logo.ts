/** Logos are passed in as PNG data URLs; this reads their size so they are never stretched. */

/**
 * The pixel size of a base64 PNG, read from its IHDR chunk.
 *
 * Every exporter has to place the logo at a fixed width and needs the aspect
 * ratio to avoid stretching it. Parsing the header is cheaper and more honest
 * than hardcoding dimensions that silently become wrong when someone replaces
 * the asset.
 */
export function pngSize(dataUrl: string): { width: number; height: number } | null {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return null
  try {
    const binary = atob(dataUrl.slice(comma + 1))
    // PNG: 8-byte signature, then a length+type IHDR chunk whose data begins
    // at byte 16 with two big-endian 32-bit integers.
    if (binary.slice(1, 4) !== 'PNG') return null
    const at = (i: number) =>
      (binary.charCodeAt(i) << 24) |
      (binary.charCodeAt(i + 1) << 16) |
      (binary.charCodeAt(i + 2) << 8) |
      binary.charCodeAt(i + 3)
    const width = at(16)
    const height = at(20)
    return width > 0 && height > 0 ? { width, height } : null
  } catch {
    return null
  }
}
