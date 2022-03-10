# Engine


```python
import engine

class App < engine.Application
  def __init__(self):
    super().__init__(version=34) # Config version 34

  def upgrade_config(self):
    self.config['port'] = 4567;

    # or

    return {
      **self.config,
      'port': 4567
    }


# ---

  async def connect(self, client):
    await client.send(...)

    async for message in client:
      pass

    self.save_config({...})

  async def begin_upgrade(self):
    from git import Repo
    from pathlib import Path

    repo = Repo(Path().resolve())
    repo.remotes.origin.pull()

  async def end_upgrade(self):
    pass

app = App()
app.start()
```



```python
# Incremental config upgrade

def upgrade_config(self):
  version = self.config['version']

  while version < self.config_version:
    if version == 6:
      upgrade_to7()
    elif version == 7:
      upgrade_to8()
    else:
      raise Exception("Unsupported version")
```
