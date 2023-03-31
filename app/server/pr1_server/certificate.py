from dataclasses import dataclass
import functools
from logging import Logger
from pathlib import Path
import random
from typing import Optional

from OpenSSL import SSL, crypto
from pr1.util.misc import fast_hash

from .util import IPAddress, format_list


@dataclass(kw_only=True, frozen=True)
class CertInfo:
  cert_path: Path
  common_name: str
  expired: bool
  fingerprint_sha1: str
  fingerprint_sha256: str
  key_path: Path
  serial: int

  @functools.cached_property
  def serial_formatted(self):
    serial_raw = f"{self.serial:018X}"
    return ":".join(serial_raw[i:(i + 2)] for i in range(0, len(serial_raw), 2))


def use_certificate(certs_dir: Path, /, addresses: Optional[list[IPAddress]] = None, *, logger: Logger):
  if addresses:
    cert_dir = certs_dir / fast_hash("/".join(sorted(str(address) for address in addresses)))
  else:
    cert_dir = certs_dir / "default"

  cert_path = (cert_dir / "cert.pem")
  key_path = (cert_dir / "key.pem")

  if cert_dir.exists():
    cert = crypto.load_certificate(crypto.FILETYPE_PEM, cert_path.open("rb").read())
  else:
    logger.info(f"Generating a self-signed certificate" + (f" for " + format_list(str(address) for address in addresses) if addresses else str()))

    private_key = crypto.PKey()
    private_key.generate_key(crypto.TYPE_RSA, 4096)

    cert = crypto.X509()
    # cert.get_subject().CN = common_name
    cert.gmtime_adj_notBefore(0)
    cert.gmtime_adj_notAfter(10 * 365 * 24 * 3600)
    cert.set_serial_number(random.randrange(16 ** 17, 16 ** 18))
    cert.set_issuer(cert.get_subject())
    cert.set_pubkey(private_key)
    cert.set_version(2)
    cert.add_extensions([
      *([crypto.X509Extension(b"subjectAltName", False, ", ".join(f"IP:{address}" for address in addresses).encode("utf-8"))] if addresses else list()),
      crypto.X509Extension(b"basicConstraints", True, b"CA:true"),
      crypto.X509Extension(b"keyUsage", True, b"digitalSignature"),
      crypto.X509Extension(b"extendedKeyUsage", True, b"serverAuth"),
    ])

    cert.sign(private_key, 'sha512')

    cert_dir.mkdir(parents=True)

    with cert_path.open("wb") as cert_file:
      cert_file.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))

    with key_path.open("wb") as key_file:
      key_file.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, private_key))

  cert_info = CertInfo(
    cert_path=cert_path,
    common_name=cert.get_issuer().CN,
    expired=cert.has_expired(),
    fingerprint_sha1=cert.digest("sha1").decode("utf-8"),
    fingerprint_sha256=cert.digest("sha256").decode("utf-8"),
    key_path=key_path,
    serial=cert.get_serial_number()
  )

  if cert_info.expired:
    logger.error("The certificate has expired.")
    return None

  logger.debug(f"Using certificate with serial number '{cert_info.serial_formatted}'")

  return cert_info
