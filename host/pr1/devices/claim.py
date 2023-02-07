import asyncio
import traceback
from asyncio import Event, Future
from typing import Any, Callable, Coroutine, Literal, Optional, Protocol, overload
import warnings
import weakref

from ..util.asyncio import DualEvent


# @deprecated
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
  def __init__(self, target: 'Claimable'):
    self._event = DualEvent()
    self._target = target

  @property
  def owned(self):
    return self._event.is_set()

  def destroy(self):
    if self.owned:
      self._target._designate_owner()
    else:
      self._target._claims.remove(self)

  async def lost(self):
    await self._event.wait_unset()

  async def wait(self):
    await self._event.wait_set()

class Claimable:
  def __init__(self):
    self._claims = list[Claim]() # TODO: Change to weakrefs
    self._current_claim_ref: Optional[weakref.ref[Claim]] = None

  def _get_current_claim(self):
    return self._current_claim_ref() if self._current_claim_ref else None

  def _designate_owner(self):
    if current_claim := self._get_current_claim():
      current_claim._event.unset()

    if self._claims:
      new_claim, *self._claims = self._claims
      new_claim._event.set()

      self._current_claim_ref = weakref.ref(new_claim, self._finalize_claim)

  def _finalize_claim(self, ref):
    warnings.warn(f"Leak of claim to {self}")

    if self._current_claim_ref is ref:
      self._designate_owner()

  def claim(self):
    claim = Claim(self)
    self._claims.append(claim)

    if not self._get_current_claim():
      self._designate_owner()

    return claim
