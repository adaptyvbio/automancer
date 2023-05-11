import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import externalLibraries from './external.js';


let workingDirPath = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <link href="/index.css" rel="stylesheet">
    <script type="importmap">
      ${JSON.stringify({
        imports: Object.fromEntries(
          Object.entries(externalLibraries).map(([libraryName, libraryPath]) => [libraryName, `/${libraryPath}`])
        )
      })}
    </script>
  </head>
  <body data-plaform="browser">
    <div id="root"></div>
    <script type="module">
      import { createBrowserApp } from 'pr1';
      createBrowserApp(document.getElementById('root'));
    </script>
  </body>
</html>
`;

await fs.writeFile(path.join(workingDirPath, 'dist/index.html'), html);
