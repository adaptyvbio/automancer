/**
 * Creates an `Error` instance with a `code` property.
 *
 * @param message The error's message.
 * @param code The error's code, such as `APP_FINGERPRINT_MISMATCH`.
 */
export function createErrorWithCode(message: string, code: string) {
  let err = new Error(message);

  // @ts-expect-error
  err.code = code;

  return err;
}
