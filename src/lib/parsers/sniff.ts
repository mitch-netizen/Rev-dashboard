// Content sniffing, not extension-based — reports have arrived before with
// a filename that didn't match their real format, so we check the actual
// bytes rather than trusting the name.

export type SniffedFileType = "pdf" | "xlsx" | "text";

export function sniffFileType(buffer: Buffer): SniffedFileType {
  if (buffer.subarray(0, 4).toString("ascii") === "%PDF") {
    return "pdf";
  }
  // ZIP local file header magic number — real .xlsx files are ZIP/OOXML
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return "xlsx";
  }
  return "text";
}
