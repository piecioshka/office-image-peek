import { ZipError } from '../core/zip/zip-error';
import type { MessageKey } from './i18n';

/** Any failure while opening maps to a message; only `cfb` is told apart. */
export function errorMessageKey(error: unknown): MessageKey {
  if (error instanceof ZipError && error.code === 'cfb') {
    return 'errorEncrypted';
  }
  return 'errorInvalid';
}
