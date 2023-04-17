import childProcess from 'node:child_process';
import fs from 'node:fs/promises';


export async function fsMkdir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}


export interface RunCommandOptions {
  architecture?: string | null;
  cwd?: string;
  ignoreErrors?: unknown;
  timeout?: number;
}

export async function runCommand(args: string[] | string, options: RunCommandOptions & { ignoreErrors: true; }): Promise<[string, string] | null>;
export async function runCommand(args: string[] | string, options?: RunCommandOptions): Promise<[string, string]>;
export async function runCommand(args: string[] | string, options?: RunCommandOptions) {
  if (typeof args === 'string') {
    args = args.split(' ');
  }

  if (options?.architecture && (process.platform === 'darwin')) {
    args = ['arch', '-arch', options.architecture, ...args];
  }

  let [execPath, ...otherArgs] = args;

  return await new Promise<[string, string] | null>((resolve, reject) => {
    childProcess.execFile(execPath, otherArgs, {
      cwd: options?.cwd,
      timeout: (options?.timeout ?? 1000)
    }, (err, stdout, stderr) => {
      if (err) {
        if (options?.ignoreErrors) {
          resolve(null);
        } else {
          reject(err);
        }
      } else {
        resolve([stdout, stderr]);
      }
    });
  });
}
