import { machineId as getMachineId } from 'node-machine-id';
import path from 'path';
import type { DraftCompilation, DraftRange } from 'pr1';
import { SocketClient, searchForHostEnvironments, BridgeSocket, HostEnvironments, HostIdentifier, HostEnvironment, SocketClientClosed } from 'pr1-library';
import { HostDraft, HostDraftCompilerOptions } from 'pr1';
import vscode, { TextDocument } from 'vscode';

import { Deferred, findMap } from './util';


export interface DocumentInfo {
  compilation: DraftCompilation | null;
  promise: Promise<void> | null;
}


export const HostIdentifierStorageKey = 'hostIdentifier';
export const LanguageName = 'prl';


const extension = {
  documentInfos: new Map<vscode.TextDocument, DocumentInfo>(),
  hostClient: null as (SocketClient | null),
  machineId: null as unknown as string,

  async removeHost() {
    let currentHostClient = extension.hostClient;

    if (currentHostClient) {
      extension.hostClient = null;

      currentHostClient.close();
      await currentHostClient.closed;
    }
  },
  async selectHost(environment: HostEnvironment, context: vscode.ExtensionContext) {
    let bridge = environment.bridges.find((bridge): bridge is BridgeSocket => bridge.type === 'socket');

    if (!bridge) {
      // TODO: Fix the fact that if the error isn't closed, the function never returns
      await vscode.window.showErrorMessage('Unsupported host bridge');
      return false;
    }

    // Remove the old client
    extension.removeHost();

    try {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: 'Connecting to setup',
        cancellable: true
      }, async (progress, token) => {
        let options = bridge!.options;

        let hostClient = new SocketClient(
          options.type === 'inet'
            ? {
              family: '4',
              host: options.hostname,
              port: options.port
            }
            : options.path
        );

        await new Promise<void>((resolve) => void setTimeout(() => void resolve(), 2000));

        await hostClient.ready;

        hostClient.start().catch((err) => {
          console.log(err);
        });

        (async () => {
          let userClosed = await hostClient.closed;
          extension.hostClient = null;

          if (!userClosed) {
            await vscode.window.showErrorMessage('Lost connection to setup');
          }
        })();

        extension.hostClient = hostClient;
      });
    } catch (err: any) {
      await vscode.window.showErrorMessage(`Failed to connect: ${err}`);
      return false;
    }


    // Update the stored value

    await context.workspaceState.update(HostIdentifierStorageKey, environment.identifier);

    // true = Success
    return true;
  }
};


export async function activate(context: vscode.ExtensionContext) {
  extension.machineId = await getMachineId();

  let hostIdentifier = context.workspaceState.get<string>(HostIdentifierStorageKey);

  (async () => {
    let environments = await searchForHostEnvironments();

    if (hostIdentifier) {
      let environment = environments[hostIdentifier];

      if (environment && (await extension.selectHost(environments[hostIdentifier], context))) {
        return;
      }

      await context.workspaceState.update(HostIdentifierStorageKey, undefined);
      hostIdentifier = undefined;
    }

    if (!hostIdentifier && (Object.values(environments).length > 0)) {
      let selectedItem = await vscode.window.showInformationMessage('Select a setup to enable language features', 'Select');

      if (selectedItem === 'Select') {
        await vscode.commands.executeCommand('pr1.setHostIdentifier');
      }
    }
  })();


  context.subscriptions.push(vscode.commands.registerCommand('pr1.setHostIdentifier', async () => {
    let environments = await searchForHostEnvironments();
    let currentHostIdentifier = context.workspaceState.get<string>(HostIdentifierStorageKey);

    if (Object.values(environments).length < 1) {
      await vscode.window.showErrorMessage('No available setup detected');
      return;
    }

    let selectedItem = await vscode.window.showQuickPick([
      ...Object.values(environments).map((environment) => {
        let picked = (environment.identifier === currentHostIdentifier);

        return {
          id: environment.identifier,
          description: (environment.bridges.length > 0 ? '– Already running' : ''),
          detail: environment.bridges.map((bridge) => {
            switch (bridge.type) {
              case 'socket':
                switch (bridge.options.type) {
                  case 'inet':
                    return `TCP socket (${bridge.options.hostname}:${bridge.options.port})`;
                  case 'unix':
                    return 'UNIX socket';
                }

              case 'websocket':
                return `WebSocket (${bridge.options.hostname}:${bridge.options.port})`
            }
          }).join(', '),
          label: (environment.label ?? 'Untitled') + (picked ? ' (current)' : ''),
          picked
        };
      }),
      {
        id: null,
        label: 'Disable'
      }
    ]);

    if (!selectedItem) {
      return;
    }

    if (!selectedItem.id) {
      await context.workspaceState.update(HostIdentifierStorageKey, undefined);
      await extension.removeHost();
      return;
    }

    await extension.selectHost(environments[selectedItem.id], context);
  }));


  // Language service

  let addDocumentInfoForDocument = (document: TextDocument) => {
    extension.documentInfos.set(document, {
      compilation: null,
      promise: null
    });
  };

  let getCompilationOfDocument = async (document: TextDocument) => {
    let info = extension.documentInfos.get(document)!;

    if (!extension.hostClient) {
      return null;
    }

    if (!info.compilation) {
      if (!info.promise) {
        info.promise = extension.hostClient.request({
          type: 'compileDraft',
          draft: {
            id: document.uri.toString(),
            documents: [
              { id: '_',
                contents: document.getText(),
                owner: (document.uri.scheme === 'file')
                  ? {
                    id: extension.machineId,
                    location: document.fileName
                  }
                  : null,
                path: path.basename(document.fileName) }
            ],
            entryDocumentId: '_'
          } satisfies HostDraft,
          options: {
            trusted: true // TODO: Put real value
          } satisfies HostDraftCompilerOptions
        }).then((compilation: DraftCompilation) => {
          info.compilation = compilation;
          info.promise = null;
        });
      }

      try {
        await info.promise;
      } catch (err) {
        if (err instanceof SocketClientClosed) {
          return null;
        }

        throw err;
      }
    }

    return info.compilation!;
  };

  for (let document of vscode.workspace.textDocuments) {
    if (document.languageId === LanguageName) {
      addDocumentInfoForDocument(document);
    }
  }

  vscode.workspace.onDidOpenTextDocument((document) => {
    if (document.languageId === LanguageName) {
      addDocumentInfoForDocument(document);
    }
  });

  vscode.workspace.onDidChangeTextDocument((event) => {
    let info = extension.documentInfos.get(event.document);

    if (info) {
      info.compilation = null;
    }
  });

  vscode.workspace.onDidCloseTextDocument((document) => {
    extension.documentInfos.delete(document);
  });


  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(LanguageName, {
    provideCompletionItems: async (document, position, token, context) => {
      let compilation = await getCompilationOfDocument(document);

      if (!compilation) {
        return null;
      }

      let match = findMap(compilation.analysis.completions, (completion) => {
        let modelRange = findMap(completion.ranges, (draftRange) => {
          let modelRange = getModelRangeFromDraftRange(document, draftRange);

          return modelRange.contains(position)
            ? modelRange
            : null;
        });

        return modelRange
          ? { completion, range: modelRange }
          : null;
      });

      if (!match) {
        return null;
      }

      return match.completion.items.map((item) => ({
        ...(item.signature && { detail: item.signature }),
        ...(item.documentation && { documentation: item.documentation }),
        insertText: item.text,
        kind: {
          class: vscode.CompletionItemKind.Class,
          constant: vscode.CompletionItemKind.Constant,
          enum: vscode.CompletionItemKind.Enum,
          field: vscode.CompletionItemKind.Field,
          property: vscode.CompletionItemKind.Property
        }[item.kind as string]!,
        label: {
          ...(item.namespace && { description: item.namespace }),
          ...(item.sublabel && { detail: ' ' + item.sublabel }),
          label: item.label
        },
        range: match!.range
      }));
    }
  }));

  context.subscriptions.push(vscode.languages.registerHoverProvider(LanguageName, {
    provideHover: async (document, position, token) => {
      let compilation = await getCompilationOfDocument(document);

      if (!compilation) {
        return null;
      }

      let result = compilation.analysis.hovers
        .map((hover) => ({
          hover,
          range: getModelRangeFromDraftRange(document, hover.range)
        }))
        .find(({ range }) => range.contains(position));

      return result && new vscode.Hover(
        result.hover.contents.map((str) => new vscode.MarkdownString(str)),
        result.range
      );
    },
  }));
}

export async function deactivate() {
  await extension.removeHost();
}


export function getModelRangeFromDraftRange(document: vscode.TextDocument, range: DraftRange): vscode.Range {
  return new vscode.Range(
    document.positionAt(range[0]),
    document.positionAt(range[1])
  );
}
