import asyncio
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
from runner.chip import Chip
from runner.master import Master
from runner.model import Model
from runner.protocol import Protocol
import runner.models
import runner.reader as reader


# Matrix
# Node

from collections import namedtuple

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


  def _debug(self):
    # -- Debug --------------------------------------------

    chip = self.create_chip(model_id=list(self.models.keys())[0], name="Default chip")
    _chip = self.create_chip(model_id=list(self.models.keys())[1], name="Other chip")
    draft = self.create_draft(str(uuid.uuid4()), (Path(__file__).parent.parent / "test.yml").open().read())

    codes = {
      'control': {
        'arguments': [0, 1, None, None]
      }
    }

    def update_callback():
      pass

    # self.start_plan(chip, codes, draft, update_callback=update_callback)

    # try:
    #   protocol = Protocol(
    #     (Path(__file__).parent.parent / "test.yml").open().read(),
    #     parsers={ namespace: unit.Parser for namespace, unit in self.units.items() },
    #     models=self.models
    #   )

    #   pprint(protocol.export())
    # except reader.LocatedError as e:
    #   e.display()
    #   # raise e


  def create_chip(self, model_id, name):
    model = self.models[model_id]
    matrices = { namespace: unit.Matrix.load(model.sheets[namespace]) for namespace, unit in self.units.items() if unit.Matrix }
    chip = Chip(id=str(uuid.uuid4()), master=None, matrices=matrices, model=model, name=name, runners=dict())

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
        models=self.models
      )
    except reader.LocatedError as e:
      errors.append(DraftError(message=e.args[0], range=(e.location.start, e.location.end)))

    draft = Draft(
      id=draft_id,
      errors=errors,
      protocol=protocol,
      source=source
    )

    self.drafts[draft_id] = draft
    return draft

  def start_plan(self, chip, codes, draft, *, update_callback):
    if chip.master:
      raise Exception("Already running")

    chip.master = Master(chip=chip, codes=codes, protocol=draft.protocol, update_callback=update_callback)
    chip.master.start()

    del self.drafts[draft.id]


    async def a():
      # await asyncio.sleep(1.5)
      # chip.master.pause()
      # await asyncio.sleep(1)
      await asyncio.sleep(5)
      chip.master.resume()

    loop = asyncio.get_event_loop()
    # loop.create_task(a())

    # import asyncio
    # asyncio.run(chip.master.wait())


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
          "master": chip.master and chip.master.export(),
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
          "protocol": draft.protocol and draft.protocol.export(),
          "source": draft.source
        } for draft in self.drafts.values()
      }
    }



# -------


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

      if message["type"] == "startPlan":
        chip = self.host.chips[message["chipId"]]
        draft = self.host.drafts[message["draftId"]]

        def update_callback():
          self.update()

        self.host.start_plan(chip=chip, codes=message["codes"], draft=draft, update_callback=update_callback)

      self.update()
      # await client.send(json.dumps(self.get_state()))

    # import asyncio
    # await asyncio.Future()

  def broadcast(self, message):
    websockets.broadcast(self.clients, message)

  def update(self):
    self.broadcast(json.dumps(self.host.get_state()))

  def start(self):
    # asyncio.run(self.serve())
    # return

    # loop = asyncio.new_event_loop()
    # asyncio.set_event_loop(loop)

    loop = asyncio.get_event_loop()

    async def a():
      await asyncio.sleep(1)
      print('Done')

    # loop.create_task(self.serve())
    # loop.run_forever()

    # asyncio.ensure_future(a(), loop=loop) # asyncio.get_event_loop())
    # asyncio.ensure_future(self.serve(), loop=loop) # asyncio.get_event_loop())

    # loop.create_task(self.host._debug())

    self.host._debug()

    loop.create_task(self.serve())
    loop.run_forever()

    # loop.run_until_complete(self.serve())

    # try:
    #   loop.run_forever()
    #   tasks = asyncio.Task.all_tasks()
    #   print(">>", tasks)
    # finally:
    #   loop.close()

  async def serve(self):
    async def handler(client):
      self.clients.add(client)

      try:
        await self.connect(client)
      finally:
        self.clients.remove(client)

    stop = asyncio.Future()

    server = await websockets.serve(handler, host=self.hostname, port=self.port)
    await server.wait_closed()

    # try:
    #   async with websockets.serve(handler, host=self.hostname, port=self.port):
    #     await stop
    # except Exception as e:
    #   print(">>>", e)


app = App()
app.start()
