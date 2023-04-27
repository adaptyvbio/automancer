from typing import Awaitable, Callable


SimpleCallbackFunction = Callable[[], None]
SimpleAsyncCallbackFunction = Callable[[], Awaitable[None]]
