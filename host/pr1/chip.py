class Chip:
  def __init__(self, id, master, matrices, model, name, runners):
    self.id = id
    self.master = master
    self.matrices = matrices
    self.metadata = { 'name': name }
    self.model = model
    self.runners = runners
