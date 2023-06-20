import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import externalLibraries from '../../../client/scripts/external.js';


let packageDirPath = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

for (let view of [
  { name: 'host',
    csp: `default-src 'self'; img-src 'self' data:; script-src * 'nonce-71e54eb8'; style-src 'self' 'unsafe-inline'` },
  { name: 'startup',
    csp: `default-src 'self'; img-src 'self' data:; script-src 'self' 'nonce-71e54eb8'; style-src 'self' 'unsafe-inline'` }
]) {
  let html = `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy" content="${view.csp}">
      <link href="../../client/index.css" rel="stylesheet">
      <script type="importmap" nonce="71e54eb8">
        ${JSON.stringify({
          imports: Object.fromEntries(
            Object.entries(externalLibraries).map(([libraryName, libraryPath]) => [libraryName, `../../client/${libraryPath}`])
          )
        })}
      </script>
      <script src="../../renderer/${view.name}/renderer.js" type="module"></script>
    </head>
    <body>
      <div id="root"></div>
      <style nonce="20cf1f58">
        * {
          user-select: none;
          -webkit-user-drag: none;
        }

        .startup-root {
          border-radius: 0;
        }
      </style>
    </body>
  </html>
  `;

  let outputFilePath = path.join(packageDirPath, `lib/static/${view.name}/index.html`);

  await fs.mkdir(path.dirname(outputFilePath), { recursive: true });
  await fs.writeFile(outputFilePath, html);
}
