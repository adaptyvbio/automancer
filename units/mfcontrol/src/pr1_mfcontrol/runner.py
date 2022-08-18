from collections import namedtuple
from enum import IntEnum

from pr1.units.base import BaseRunner

from . import namespace
from .model import Model


Valve = namedtuple("Valve", ['host_valve_index'])

class ValveError(IntEnum):
  Unbound = 0
  Disconnected = 1
  Unwritable = 2


class Runner(BaseRunner):
  def __init__(self, chip, host):
    self._chip = chip
    self._host = host
    self._executor = self._host.executors[namespace]

    self._model = None
    self._valve_map = None

    self._proto_mask = None
    self._signal = None

  @property
  def _default_signal(self):
    return sum([1 << channel_index for channel_index, channel in enumerate(self._model.channels) if channel.inverse]) if self._model else None

  async def _read(self):
    self._signal = 0

    for channel_index, valve_index in enumerate(self._valve_map):
      if valve_index is not None:
        valve = self._executor.valves[valve_index]

        if await valve.node.read():
          self._signal |= (1 << channel_index)

    self._signal ^= self._default_signal

  async def _write(self):
    final_signal = self._default_signal ^ self._signal

    for channel_index, valve_index in enumerate(self._valve_map):
      if valve_index is not None:
        active = final_signal & (1 << channel_index) > 0
        valve = self._executor.valves[valve_index]
        await valve.node.write(active)

  async def command(self, data):
    if data["type"] == "setModel":
      model_id = data["modelId"]

      if model_id:
        self._model = self._host.executors[namespace].models[model_id]
        self._signal = 0
        self._valve_map = [None] * len(self._model.channels)
        await self._write()
      else:
        self._model = None
        self._signal = None
        self._valve_map = None

      self._chip.update_runners(namespace)

    if data["type"] == "setSignal":
      self._signal = int(data["signal"])
      await self._write()

    if data["type"] == "setValveMap":
      self._valve_map = data["valveMap"]
      await self._write()
      self._chip.update_runners(namespace)

  def export(self):
    def get_valve_state(channel_index):
      valve_index = self._valve_map[channel_index]

      if valve_index is None:
        return { "error": ValveError.Unbound }

      valve = self._executor.valves[valve_index]

      if not valve.node.connected:
        return { "error": ValveError.Disconnected }

      if valve.node.unwritable:
        return { "error": ValveError.Unwritable }

      return { "error": None }

    return {
      "settings": {
        "model": (self._model.export() if self._model else None),
        "valveMap": self._valve_map
      },
      "state": {
        "protoMask": self._proto_mask,
        "signal": str(self._signal),
        "valves": [get_valve_state(channel_index) for channel_index in range(len(self._valve_map))]
      } if self._model is not None else None
    }

  def serialize(self):
    return ((self._model.serialize() if self._model else None), self._valve_map)

  def unserialize(self, state):
    model, self._valve_map = state

    # TODO: check if the valve map is still valid with respect to the current setup

    if model:
      self._model = Model.unserialize(model)
      self._signal = 0
