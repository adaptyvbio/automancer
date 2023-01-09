import asyncio
import traceback
from typing import Any, Callable, Coroutine, Literal, Optional, Protocol, overload


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


ClaimOwnerLostCallback = Callable[[bool], None]

class ClaimOwner:
  def __init__(self, *, target: 'Claimable', symbol: ClaimSymbol):
    self.target = target
    self.symbol = symbol

    self._lost_callbacks = list[ClaimOwnerLostCallback]()
    self._lost_future = asyncio.Future()

  def _lost(self, *, lost_to_child: bool = False):
    for callback in self._lost_callbacks:
      callback(lost_to_child)

    self._lost_future.set_result(lost_to_child)

  @property
  def valid(self):
    return self.target._owner is self

  def add_lost_callback(self, callback: ClaimOwnerLostCallback, /):
    self._lost_callbacks.append(callback)

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


class ClaimTransferError(Exception):
  pass

class ClaimTransferFailUnknownError(ClaimTransferError):
  pass

class ClaimTransferFailChildError(ClaimTransferError):
  pass


class Claimant(Protocol):
  # Return value: whether to keep the claimant
  def fail(self, error: ClaimTransferError) -> bool:
    ...

  def succeed(self, owner: ClaimOwner):
    ...

class ClaimantWithFuture(Claimant):
  def __init__(self, *, raise_on_failure: bool):
    self._future = asyncio.Future[ClaimOwner]()
    self._raise_on_failure = raise_on_failure

  def fail(self, error):
    if self._raise_on_failure:
      self._future.set_exception(error)
      return False

    return True

  def succeed(self, owner):
    self._future.set_result(owner)


class ClaimantPerpetualClaim(Claimant):
  def __init__(self, claim: 'PerpetualClaim', /):
    self._claim = claim

  def fail(self, error):
    self._claim.owned_by_child = isinstance(error, ClaimTransferFailChildError)
    return True

  def succeed(self, owner: ClaimOwner):
    self._claim.owner = owner
    self._claim._claim_pair = None
    self._claim._future.set_result(owner)
    self._claim._future = asyncio.Future()

    owner.add_lost_callback(self._claim._lost)

class PerpetualClaim:
  def __init__(self, *, symbol: ClaimSymbol, target: 'Claimable'):
    self.owned_by_child: bool = False
    self.owner: Optional[ClaimOwner]

    self._claim_pair: Optional[tuple[ClaimSymbol, Claimant]]
    self._future: asyncio.Future
    self._target = target
    self._symbol = symbol

    self._query()

  def _query(self):
    self.owner = None
    self._claim_pair = (self._symbol, ClaimantPerpetualClaim(self))
    self._future = asyncio.Future()

    self._target._add_claimant_pair(self._claim_pair)

  def _lost(self, lost_to_child: bool):
    self._future.set_result(lost_to_child)
    self._query()

  def close(self):
    if self._claim_pair:
      self._target._claimants.remove(self._claim_pair)

    if self.owner:
      self.owner.release()
      self._future.set_result(None)
    else:
      self._future.set_exception(ClaimTransferError())

  async def lost(self):
    if self.owner:
      await self._future

  async def wait(self):
    if not self.owner:
      await self._future

    assert self.owner
    return self.owner


# TODO: Detect leaks using 'weakref'
class Claimable:
  def __init__(self, *, auto_transfer: bool = False):
    self._auto_transfer = auto_transfer
    self._claimants = list[tuple[ClaimSymbol, Claimant]]()
    self._owner: Optional[ClaimOwner] = None

  def _add_claimant_pair(self, pair: tuple[ClaimSymbol, Claimant]):
    self._claimants.append(pair)
    self._claimants = sorted(self._claimants, key=(lambda claimant: claimant[0]))

  def _designate_owner(self):
    if self._claimants and (not self._owner or (self._claimants[-1][0] > self._owner.symbol)):
      symbol, claimant = self._claimants.pop()

      if self._owner:
        self._owner._lost(lost_to_child=(symbol > self._owner.symbol))

      self._owner = ClaimOwner(target=self, symbol=symbol)
      claimant.succeed(self._owner)

    for pair in self._claimants.copy():
      assert self._owner
      symbol, claimant = pair

      error = ClaimTransferFailChildError() if self._owner.symbol > symbol else ClaimTransferFailUnknownError()
      if not claimant.fail(error):
        self._claimants.remove(pair)

  def _designate_target_soon(self):
    loop = asyncio.get_running_loop()
    loop.call_soon(self._designate_owner)

  def claim(self, symbol: ClaimSymbol, *, raise_on_failure: bool = False):
    claimant = ClaimantWithFuture(raise_on_failure=raise_on_failure)
    pair = (symbol, claimant)
    self._add_claimant_pair(pair)

    async def func():
      try:
        await claimant._future
      except asyncio.CancelledError:
        self._claimants.remove(pair)
        raise

      assert self._owner
      return self._owner

    return func()

  def create_claim(self, symbol: ClaimSymbol):
    claim = PerpetualClaim(symbol=symbol, target=self)
    return claim

  def force_claim(self, symbol: ClaimSymbol) -> ClaimOwner:
    if self._owner:
      self._owner._lost()

    self._owner = ClaimOwner(target=self, symbol=symbol)
    return self._owner

  def create_token(self, symbol: ClaimSymbol):
    return PerpetualClaim(symbol=symbol, target=self)

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
