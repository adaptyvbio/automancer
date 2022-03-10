import json
from pathlib import Path
from venv import create
import yaml
import sys

from pprint import pprint


packages_dir = Path(__file__).parent.parent / "packages"
sys.path.insert(0, str(packages_dir))


import engine
from runner.chip_model import ChipModel
from runner.reader import LocatedError
from runner.protocol import Protocol
import runner.models


# Matrix
# Node

class Manager:
  def __init__(self):
    self.models = runner.models.models
    self.executors = { namespace: model.Executor() for namespace, model in self.models.items() }

  async def initialize(self):
    for executor in self.executors.values():
      await executor.initialize()


from collections import namedtuple

Chip = namedtuple("Chip", ["id", "matrices", "model", "name", "runners"])


# class ChipModel:
#   def __init__(self, *, id, name, sheets):
#     self.id = id
#     self.name = name
#     self.sheets = sheets

#   def load(path, models):
#     data = yaml.safe_load(path.open())

#     return ChipModel(
#       id=(data.get("id") or str(abs(hash(path)))),
#       name=data["name"],
#       sheets={
#         namespace: model.Sheet(data, dir=path.parent) for namespace, model in models.items()
#       }
#     )



class App(engine.Application):
  def __init__(self):
    super().__init__(version=2)

    self.chips = list()
    self.manager = Manager()

    self.data_dir = Path(__file__).parent / "app-data"
    self.data_dir.mkdir(exist_ok=True)

    self.chip_models = dict()

    for path in (self.data_dir / "chipmodels").glob("**/*.yml"):
      try:
        chip_model = ChipModel.load(path, self.manager.models)
        self.chip_models[chip_model.id] = chip_model
      except LocatedError as e:
        print(e)
        e.display()


    def create_chip():
      chip_model = list(self.chip_models.values())[0]
      matrices = { namespace: model.Matrix.load(chip_model.sheets[namespace]) for namespace, model in self.manager.models.items() }
      chip = Chip(id="v21", matrices=matrices, model=chip_model, name="Variant 21", runners=dict())

      for namespace, executor in self.manager.executors.items():
        chip.runners[namespace] = executor.create_runner(chip)

      return chip

    self.chips = [create_chip()]


    # Protocol test
    try:
      p = Protocol(
        Path("../test.yml"),
        parsers={ namespace: model.Parser for namespace, model in self.manager.models.items() },
        chip_models=self.chip_models
      )

      from pprint import pprint

      print("Stages   -> ", end="")
      pprint(p.stages)

      print("Segments -> ", end="")
      pprint(p.segments)

    except LocatedError as e:
      print(e)
      e.display()



  def get_state(self):
    return {
      "id": self.config['id'],
      "name": self.setup['name'],
      "chips": {
        chip.id: {
          "id": chip.id,
          "matrices": {
            namespace: matrix.export() for namespace, matrix in chip.matrices.items()
          },
          "modelId": chip.model.id,
          "name": chip.name,
          "runners": {
            namespace: runner.export() for namespace, runner in chip.runners.items()
          }
        } for chip in self.chips
      },
      "chipModels": {
        model.id: {
          "id": model.id,
          "name": model.name,
          "sheets": {
            namespace: sheet.export() for namespace, sheet in model.sheets.items()
          }
        } for model in self.chip_models.values()
      },
      "devices": [{
        "id": device.id,
        "info": device.info,
        "model": namespace,
        "name": device.name
      } for namespace, executor in self.manager.executors.items() for device in executor.get_device_info()],
      "executors": { namespace: executor.export() for namespace, executor in self.manager.executors.items() }
    }


  async def connect(self, client):
    await client.send(json.dumps(self.get_state()))
    # self.broadcast(json.dumps(self.state))

    async for msg in client:
      message = json.loads(msg)

      if message["type"] == "command":
        chip = next(chip for chip in self.chips if chip.id == message["chipId"])
        namespace, command = next(iter(message["command"].items()))
        chip.runners[namespace].command(command)

      if message["type"] == "setMatrix":
        chip = next(chip for chip in self.chips if chip.id == message["chipId"])

        for namespace, matrix_data in message["update"].items():
          chip.matrices[namespace].update(matrix_data)

      self.broadcast(json.dumps(self.get_state()))
      # await client.send(json.dumps(self.get_state()))

    # import asyncio
    # await asyncio.Future()

  async def initialize(self):
    path = Path(__file__).parent
    self.setup = yaml.safe_load((path / "setup.yml").open())

    for device in self.setup['devices']:
      executor = self.manager.executors[device['model']]
      executor.add_device(device)

    await self.manager.initialize()


app = App()
# app.start()
