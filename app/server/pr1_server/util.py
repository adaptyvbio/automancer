from ipaddress import IPv4Address, IPv6Address
from typing import Iterator, Sequence


IPAddress = IPv4Address | IPv6Address


def format_list(items: Iterator[str], /):
  *head, tail = items
  return ", ".join(head) + (" and " if head else str()) + tail
