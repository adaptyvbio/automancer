from collections import namedtuple
import functools
from os import stat
import serial, serial.tools.list_ports


Device = namedtuple("Device", ["description", "build", "id", "name"])
SerialDriverDevice = namedtuple("SerialDriverDevice", ["product_id", "vendor_id"])


class SerialDriver:
  def __init__(self, name: str) -> None:
    # TODO: add options baudrate, aio
    self._serial = serial.Serial(name, timeout=0.5)

  @classmethod
  def list_devices(cls) -> list[Device]:
    ref_device = cls.device

    # return [{
    #   'id': device.device,
    #   'name': device.name,
    #   'description': device.description if device.description != 'n/a' else None
    # } for device in serial.tools.list_ports.comports() if True or (device.pid == ref_device.product_id) and (device.vid == ref_device.vendor_id)]

    # for device in serial.tools.list_ports.comports():
    #   print(device.device, device.name, device.pid, device.vid)

    return [Device(
      id=device.device,
      name=device.name,
      description=device.description if device.description != 'n/a' else None,
      build=functools.partial(cls, device.device)
    ) for device in serial.tools.list_ports.comports() if (device.pid == ref_device.product_id) and (device.vid == ref_device.vendor_id)]
