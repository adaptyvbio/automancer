import fs from 'node:fs/promises';


export async function fsMkdir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}
