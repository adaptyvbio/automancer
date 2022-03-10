from . import control


models = {
  model.namespace: model for model in [control]
}

__all__ = ["models"]
