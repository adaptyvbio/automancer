class Chip:
  def __init__(self, id, master, matrices, model, name, runners):
    self.id = id
    self.master = master
    self.matrices = matrices
    self.metadata = { 'name': name }
    self.model = model
    self.runners = runners

  # Update runners following a matrix update
  def update_runners(self):
    for runner in self.runners.values():
      runner.update()
