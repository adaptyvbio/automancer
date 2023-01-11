from asyncio import Future
import asyncio
import hashlib
from io import IOBase
import logging
import traceback
from typing import Awaitable, Protocol


FileObject = IOBase

def fast_hash(input):
  return hashlib.sha256(input.encode("utf-8")).hexdigest()

def log_exception(logger, *, level = logging.DEBUG):
  for line in traceback.format_exc().split("\n"):
    if line:
      logger.log(level, line)

class Exportable(Protocol):
  def export(self) -> object:
    ...

class UnreachableError(Exception):
  pass

async def race(*awaitables: Awaitable):
  futures = [asyncio.ensure_future(awaitable) for awaitable in awaitables]
  wait = asyncio.wait(futures, return_when=asyncio.FIRST_COMPLETED)

  try:
    done, pending = await asyncio.shield(wait)
  except asyncio.CancelledError:
    for future in futures:
      future.cancel()

    await asyncio.wait(futures)
    raise

  done_future = next(iter(done))

  for future in pending:
    future.cancel()

  await asyncio.wait(pending)

  return futures.index(done_future), done_future.result()


if __name__ == "__main__":
  async def main():
    job = asyncio.create_task(race(
      asyncio.sleep(1),
      asyncio.sleep(.8)
    ))

    async def a():
      try:
        index, _ = await job
      except asyncio.CancelledError:
        print("Cancelled")
      else:
        print(index)

    async def b():
      await asyncio.sleep(0.5)
      job.cancel()

    await asyncio.gather(a(), b())

  asyncio.run(main())
