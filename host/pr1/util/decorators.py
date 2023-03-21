from logging import Logger
import warnings
import functools


def debug(cls):
  def repr_cls(self):
    props = ", ".join(f"{key}={repr(value)}" for key, value in self.__dict__.items())
    return f"{type(self).__name__}({props})"

  setattr(cls, '__repr__', repr_cls)
  return cls


def deprecated(func):
  @functools.wraps(func)

  def new_func(*args, **kwargs):
    warnings.simplefilter('always', DeprecationWarning)
    warnings.warn(
      message="Call to deprecated function {}.".format(func.__name__),
      category=DeprecationWarning,
      stacklevel=2
    )

    warnings.simplefilter('default', DeprecationWarning)

    return func(*args, **kwargs)

  return new_func


def provide_logger(parent_logger: Logger, *, name: str = '_logger'):
  def func(cls):
    index = 1
    old_init = cls.__init__

    def init(self, *args, **kwargs):
      nonlocal index

      setattr(self, name, parent_logger.getChild(f"{cls.__name__}{index}"))
      old_init(self, *args, **kwargs)
      index += 1

    cls.__init__ = init
    return cls

  return func
