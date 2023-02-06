def encode(value: int, /):
  current_value = value
  result = bytes()

  while True:
    byte_value = current_value & 0x7f
    current_value >>= 7
    last = current_value < 1

    result += bytes([byte_value | (0x80 if not last else 0)])

    if last:
      break

  return result


def decode(data: bytes, /, big_endian: bool = False):
  index = -1
  result = 0

  for index, byte in enumerate(data):
    if big_endian:
      result = (result << 7) | (byte & 0x7f)
    else:
      result |= (byte & 0x7f) << (7 * index)

    if (byte & 0x80) < 1:
      break

  return index + 1, result


if __name__ == "__main__":
  for i in range(0, 0xffffff):
    x = encode(i)
    y = decode(x)

    # print(i, y[1], len(x), y[0])
    assert i == y[1]
