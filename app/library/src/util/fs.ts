import fs from 'node:fs/promises';


/**
 * Tests whether a file exists.
 *
 * @param path The path to the potential file.
 */
export async function fsExists(path: string) {
  try {
    await fs.stat(path)
  } catch (err) {
    if ((err as { code: string; }).code === 'ENOENT') {
      return false;
    }

    throw err;
  }

  return true;
}
