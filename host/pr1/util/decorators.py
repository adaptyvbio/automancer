import warnings
import functools


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
