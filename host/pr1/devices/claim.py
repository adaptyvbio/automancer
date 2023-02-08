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
    self._ref = weakref.ref[Claim](self, target._finalize_claim)
    self._target = target

  @property
  def owned(self):
    return self._event.is_set()

  def destroy(self):
    if self.owned:
      self._target._designate_owner()
    else:
      self._target._claim_refs.remove(self._ref)

  async def lost(self):
    await self._event.wait_unset()

  async def wait(self):
    await self._event.wait_set()

class Claimable:
  def __init__(self):
    self._claim_refs = list[weakref.ref[Claim]]()
    self._current_claim_ref: Optional[weakref.ref[Claim]] = None

  def _get_current_claim(self):
    return self._current_claim_ref() if self._current_claim_ref else None

  def _designate_owner(self):
    if current_claim := self._get_current_claim():
      current_claim._event.unset()

    result = next(((claim_ref, claim) for claim_ref in self._claim_refs if (claim := claim_ref())), None)

    if result:
      owning_claim_ref, owning_claim = result
      self._claim_refs.remove(owning_claim_ref)

      owning_claim._event.set()
      self._current_claim_ref = owning_claim_ref
    else:
      self._current_claim_ref = None

  def _finalize_claim(self, ref):
    if self._current_claim_ref is ref:
      self._designate_owner()
      warnings.warn(f"Leak of owning claim to {self}")
    elif self._current_claim_ref in self._claim_refs:
      self._claim_refs.remove(self._current_claim_ref)
      warnings.warn(f"Leak of awaiting claim to {self}")

  def claim(self):
    claim = Claim(self)
    self._claim_refs.append(claim._ref)

    if not self._get_current_claim():
      self._designate_owner()

    return claim
