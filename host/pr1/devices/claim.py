import asyncio
from typing import Optional


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
  def __init__(self, *, target: 'Claimable', symbol: Optional[ClaimSymbol]):
    self.target = target
    self.symbol = symbol

    self._lost_future = asyncio.Future()

  @property
  def valid(self):
    return self.target._owner is self

  async def lost(self):
    await self._lost_future

  def release(self):
    if not self.valid:
      raise Exception("Claim has been released or is lost already")

    self.target._owner = None

    if self.target._claimants:
      symbol, future = self.target._claimants.pop(0)
      self.target._owner = Claim(target=self.target, symbol=symbol)
      future.set_result(None)

  def __repr__(self):
    return f"Claim(symbol={self.symbol}, target={self.target})"

class Claimable:
  def __init__(self):
    self._claimants = list()
    self._owner: Optional[Claim] = None

  async def claim(self, symbol: ClaimSymbol) -> Claim:
    claim = self.claim_now(symbol)

    if claim:
      return claim
    else:
      future = asyncio.Future()
      claimant = (symbol, future)
      self._claimants.append(claimant)

      try:
        await future
      except asyncio.CancelledError:
        self._claimants.remove(claimant)
        raise

      assert self._owner
      return self._owner

  def claim_now(self, symbol: Optional[ClaimSymbol] = None, *, force = False) -> Optional[Claim]:
    if (not self._owner) or (symbol and self._owner.symbol and (symbol > self._owner.symbol)) or force:
      if self._owner:
        self._owner._lost_future.set_result(None)

      self._owner = Claim(target=self, symbol=symbol)
      return self._owner
    else:
      return None


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
