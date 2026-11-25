export type ZipErrorCode =
  'not-zip' | 'cfb' | 'truncated' | 'unsupported-method' | 'encrypted-entry';

export class ZipError extends Error {
  readonly code: ZipErrorCode;

  constructor(code: ZipErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ZipError';
    this.code = code;
  }
}
