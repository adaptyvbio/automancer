import asyncio
import traceback
from typing import Any, Coroutine, Literal, Optional, overload


class ClaimSymbol:
  def __init__(self, parent: Optional['ClaimSymbol'] = None):
    self.parent = parent

  # self < other
  # other > self => other is a descendant of self
  def __lt__(self, other: 'ClaimSymbol') -> bool:
    other_symbol = other.parent

    while other_symbol:
      if other_symbol == self:
        return True

      other_symbol = other_symbol.parent

    return False

  def __gt__(self, other: 'ClaimSymbol') -> bool:
    return other < self

  def __repr__(self):
    return f"{type(self).__name__}(parent={self.parent})"


class Claim:
  def __init__(self, *, target: 'Claimable', symbol: ClaimSymbol):
    self.target = target
    self.symbol = symbol

    self._lost_future = asyncio.Future()

  @property
  def valid(self):
    return self.target._owner is self

  async def lost(self):
    return await asyncio.shield(self._lost_future)

  def release(self):
    if not self.valid:
      raise Exception("Claim has been released or is lost already")

    self.target._owner = None

    if self.target._auto_transfer:
      self.target._designate_target_soon()

  def __repr__(self):
    return f"Claim(symbol={self.symbol}, target={self.target})"


class ClaimTransferFailUnknownError(Exception):
  pass

class ClaimTransferFailChildError(Exception):
  pass

class ClaimToken:
  def __init__(self, target: 'Claimable', *, symbol: ClaimSymbol):
    self._cancelled = False
    self._claim: Optional[Claim] = None
    self._futures = set[tuple[asyncio.Future, bool]]()
    self._initial_task = target.claim(symbol, err=True, task=True)
    self._symbol = symbol
    self._target = target
    self._task = asyncio.create_task(self._loop())

  async def _loop(self):
    try:
      while True:
        try:
          if task := self._initial_task:
            self._initial_task = None
            self._claim = await task
          else:
            self._claim = await self._target.claim(self._symbol, err=True)
        except (ClaimTransferFailChildError, ClaimTransferFailUnknownError) as e:
          for pair in self._futures.copy():
            future, err = pair

            if err:
              future.set_exception(e)
              self._futures.remove(pair)

          continue

        for future, _ in self._futures:
          future.set_result(None)

        self._futures.clear()

        await self._claim.lost()
        self._claim = None
    except asyncio.CancelledError:
      if self._claim:
        self._claim.release()
        self._claim = None
    except Exception as e:
      traceback.print_exc()

  async def cancel(self):
    if self._cancelled:
      return

    self._cancelled = True

    for future, _ in self._futures:
      future.cancel()

      try:
        await future
      except asyncio.CancelledError:
        pass

    self._task.cancel()

    try:
      await self._task
    except asyncio.CancelledError:
      pass

  async def wait(self, *, err: bool = False):
    if self._claim:
      return self._claim

    future = asyncio.Future()
    pair = (future, err)
    self._futures.add(pair)

    try:
      await future
    except asyncio.CancelledError:
      self._futures.remove(pair)
      await self.cancel()

      raise

    assert self._claim
    return self._claim


class Claimable:
  def __init__(self, *, auto_transfer: bool = False):
    self._auto_transfer = auto_transfer
    self._claimants = list[tuple[ClaimSymbol, asyncio.Future, bool]]()
    self._owner: Optional[Claim] = None

  def _designate_owner(self):
    if self._claimants and (not self._owner or (self._claimants[-1][0] > self._owner.symbol)):
      symbol, future, _ = self._claimants.pop()

      if self._owner:
        self._owner._lost_future.set_result(symbol > self._owner.symbol)

      self._owner = Claim(target=self, symbol=symbol)
      future.set_result(None)

    for claimant in self._claimants.copy():
      assert self._owner
      symbol, future, err = claimant

      if err:
        future.set_exception(ClaimTransferFailChildError() if self._owner.symbol > symbol else ClaimTransferFailUnknownError())
        self._claimants.remove(claimant)

  def _designate_target_soon(self):
    loop = asyncio.get_running_loop()
    loop.call_soon(self._designate_owner)

  @overload
  def claim(self, symbol: ClaimSymbol, *, err: bool = False, task: Literal[False] = False) -> Coroutine[Any, Any, Claim]:
    ...

  @overload
  def claim(self, symbol: ClaimSymbol, *, err: bool = False, task: Literal[True]) -> asyncio.Task[Claim]:
    ...

  def claim(self, symbol: ClaimSymbol, *, err: bool = False, task: bool = False):
    future = asyncio.Future()
    claimant = (symbol, future, err)
    self._claimants.append(claimant)
    self._claimants = sorted(self._claimants, key=(lambda claimant: claimant[0]))

    async def func():
      try:
        await future
      except asyncio.CancelledError:
        self._claimants.remove(claimant)
        raise

      assert self._owner
      return self._owner

    return asyncio.ensure_future(func()) if task else func()

  def force_claim(self, symbol: ClaimSymbol) -> Claim:
    if self._owner:
      self._owner._lost_future.set_result(None)

    self._owner = Claim(target=self, symbol=symbol)
    return self._owner

  def create_token(self, symbol: ClaimSymbol):
    return ClaimToken(self, symbol=symbol)

  def transfer(self):
    assert not self._auto_transfer
    self._designate_owner()


if __name__ == '__main__':
  obj = Claimable()
  symbol = ClaimSymbol()

  async def a():
    clm = await obj.claim(symbol)
    print("A", clm)
    # await asyncio.sleep(1)
    await clm.lost()
    print("Lost")
    # clm.release()

  async def b():
    await asyncio.sleep(0.5)
    clm = await obj.claim(ClaimSymbol(symbol))
    print("B", clm)

  async def main():
    await asyncio.gather(a(), b())

    # await clm.lost()

  asyncio.run(main())
