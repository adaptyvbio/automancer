import { createErrorWithCode } from './error';
import { ClientProtocol, ServerProtocol } from './types/communication';


export async function* splitMessagesOfIterator(iterable: AsyncIterable<{ toString(): string; }>) {
  let contents = '';

  for await (let chunk of iterable) {
    contents += chunk.toString();

    let msgs = contents.split('\n');
    contents = msgs.at(-1)!;

    yield* msgs.slice(0, -1);
  }
}


export function serializeMessage(message: ClientProtocol.Message) {
  return (JSON.stringify(message) + '\n');
}

export async function* deserializeMessagesOfIterator(iterable: AsyncIterable<string>) {
  for await (let msg of iterable) {
    let message;

    try {
      message = JSON.parse(msg) as ServerProtocol.Message;
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw createErrorWithCode('Malformed message', 'APP_MALFORMED');
      }

      throw err;
    }

    yield message;
  }
}
