export interface BlobSpy {
  blob: Blob;
  /** Size in bytes of the largest slice taken from the spied blob. */
  maxSliceBytes(): number;
  /** Number of times the whole blob was read at once. */
  fullReads(): number;
}

/** Wraps a blob so tests can assert that only small ranges are read. */
export function spyBlob(source: Blob): BlobSpy {
  const blob = new Blob([source]);
  const slices: number[] = [];
  const reads: number[] = [];
  const originalSlice = blob.slice.bind(blob);
  const originalArrayBuffer = blob.arrayBuffer.bind(blob);

  blob.slice = (start, end, contentType) => {
    const part = originalSlice(start, end, contentType);
    slices.push(part.size);
    return part;
  };
  blob.arrayBuffer = () => {
    reads.push(source.size);
    return originalArrayBuffer();
  };
  blob.text = () => {
    reads.push(source.size);
    return originalArrayBuffer().then((buffer) =>
      new TextDecoder().decode(buffer),
    );
  };

  return {
    blob,
    maxSliceBytes: () => Math.max(...slices),
    fullReads: () => reads.length,
  };
}
