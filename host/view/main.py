from pathlib import Path
import appdirs
import json
import os
import platform
import sys
import time
import uuid
import yaml

from pprint import pprint


packages_dir = Path(__file__).parent.parent / "packages"
sys.path.insert(0, str(packages_dir))


import engine
from runner.model import Model
from runner.protocol import Protocol
import runner.models
import runner.reader as reader


# Matrix
# Node

from collections import namedtuple

Chip = namedtuple("Chip", ['id', 'matrices', 'model', 'name', 'runners'])
Draft = namedtuple("Draft", ['id', 'errors', 'protocol', 'source'])
DraftError = namedtuple("DraftError", ['message', 'range'])


class Host:
  def __init__(self):
    self.data_dir = Path(appdirs.site_data_dir("PRn", "LBNC"))
    self.data_dir.mkdir(exist_ok=True)

    self.chips = dict()
    self.drafts = dict()

    # os.chmod(self.data_dir, 0o775)


    # -- Load configuration -------------------------------

    conf_path = self.data_dir / "setup.yml"

    if conf_path.exists():
      try:
        conf = reader.loads((self.data_dir / "setup.yml").open().read())
      except reader.LocatedError as e:
        e.display()
        sys.exit(1)
    else:
      conf = {
        'id': str(uuid.uuid4()),
        'name': platform.node(),
        'units': dict(),
        'version': 1
      }

      conf_path.open("w").write(reader.dumps(conf))

    self.id = conf.get('id') or hex(uuid.getnode())[2:]
    self.name = conf['name']
    self.start_time = round(time.time() * 1000)
    self.units = runner.models.models

    self.executors = {
      namespace: unit.Executor(conf['units'].get(namespace, dict())) for namespace, unit in self.units.items()
    }

    # self.executors = dict()

    # for namespace, unit in units.items():
    #   executor = unit.Executor(self.conf.get(namespace, dict()))
    #   self.executors[namespace] = executor

    # for namespace, executor in self.units.items():
    #   unit_conf = self.conf.get(namespace, dict())
    #   executor.initialize()

    #   executor = self.manager.executors[device['model']]
    #   executor.add_device(device)

    # await self.manager.initialize()


    # -- Load models --------------------------------------

    models_dir = self.data_dir / "models"
    models_dir.mkdir(exist_ok=True)

    self.models = dict()

    for path in models_dir.glob("**/*.yml"):
      try:
        chip_model = Model.load(path, self.units)
        self.models[chip_model.id] = chip_model
      except reader.LocatedError as e:
        e.display()
        sys.exit(1)


    # debug
    self.create_chip(model_id=list(self.models.keys())[0], name="Default chip")


  def create_chip(self, model_id, name):
    model = self.models[model_id]
    matrices = { namespace: unit.Matrix.load(model.sheets[namespace]) for namespace, unit in self.units.items() }
    chip = Chip(id=str(uuid.uuid4()), matrices=matrices, model=model, name=name, runners=dict())

    for namespace, executor in self.executors.items():
      chip.runners[namespace] = executor.create_runner(chip)

    self.chips[chip.id] = chip
    return chip

  def create_draft(self, draft_id, source):
    errors = list()
    protocol = None

    try:
      protocol = Protocol(
        source,
        parsers={ namespace: unit.Parser for namespace, unit in self.units.items() },
        chip_models=self.models
      )
    except reader.LocatedError as e:
      errors.append(DraftError(message=e.args[0], range=(e.location.start, e.location.end)))

    self.drafts[draft_id] = Draft(
      id=draft_id,
      errors=errors,
      protocol=protocol,
      source=source
    )


  def get_state(self):
    return {
      "info": {
        "id": self.id,
        "name": self.name,
        "startTime": self.start_time
      },
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
        } for chip in self.chips.values()
      },
      "models": {
        model.id: {
          "id": model.id,
          "name": model.name,
          "sheets": {
            namespace: sheet.export() for namespace, sheet in model.sheets.items()
          }
        } for model in self.models.values()
      },
      "devices": [{
        "id": device.id,
        "info": device.info,
        "model": namespace,
        "name": device.name
      } for namespace, executor in self.executors.items() for device in executor.get_device_info()],
      "executors": { namespace: executor.export() for namespace, executor in self.executors.items() },
      "drafts": {
        draft.id: {
          "id": draft.id,
          "errors": [{
            "message": error.message,
            "range": error.range
          } for error in draft.errors],
          "source": draft.source
        } for draft in self.drafts.values()
      }
    }



# -------


import asyncio
from pathlib import Path
import websockets


class App():
  def __init__(self):
    self.host = Host()
    self.clients = set()

    self.hostname = "127.0.0.1"
    self.port = 4567

  async def connect(self, client):
    await client.send(json.dumps(self.host.get_state()))
    # self.broadcast(json.dumps(self.state))

    async for msg in client:
      message = json.loads(msg)

      if message["type"] == "command":
        chip = self.host.chips[message["chipId"]]
        namespace, command = next(iter(message["command"].items()))
        chip.runners[namespace].command(command)

      if message["type"] == "createChip":
        self.host.create_chip(model_id=message["modelId"], name="Untitled chip")

      if message["type"] == "createDraft":
        self.host.create_draft(draft_id=message["draftId"], source=message["source"])

      if message["type"] == "deleteChip":
        # TODO: checks
        del self.host.chips[message["chipId"]]

      if message["type"] == "setMatrix":
        chip = self.host.chips[message["chipId"]]

        for namespace, matrix_data in message["update"].items():
          chip.matrices[namespace].update(matrix_data)

      self.broadcast(json.dumps(self.host.get_state()))
      # await client.send(json.dumps(self.get_state()))

    # import asyncio
    # await asyncio.Future()

  def broadcast(self, message):
    websockets.broadcast(self.clients, message)

  def start(self):
    asyncio.run(self.serve())

  async def serve(self):
    async def handler(client):
      self.clients.add(client)

      try:
        await self.connect(client)
      finally:
        self.clients.remove(client)

    stop = asyncio.Future()

    async with websockets.serve(handler, host=self.hostname, port=self.port):
      await stop


app = App()
app.start()
