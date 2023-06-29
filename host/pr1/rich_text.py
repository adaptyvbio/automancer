from dataclasses import dataclass
from typing import TypeAlias

from .util.misc import ExportableABC


class BaseRichTextExplicitComponent(ExportableABC):
  def format(self) -> str:
    ...

RichTextComponent: TypeAlias = BaseRichTextExplicitComponent | str


@dataclass(slots=True)
class RichTextCode(BaseRichTextExplicitComponent):
  value: 'RichText'

  def __init__(self, *components: RichTextComponent):
    self.value = RichText(*components)

  def export(self) -> object:
    return {
      "type": "code",
      "value": self.value.export()
    }

  def format(self):
    return f"`{self.value.format()}`"


@dataclass(slots=True)
class RichTextLink(BaseRichTextExplicitComponent):
  url: str
  value: 'RichText'

  def __init__(self, *components: RichTextComponent, url: str):
    self.url = url
    self.value = RichText(*components)

  def export(self) -> object:
    return {
      "type": "link",
      "url": self.url,
      "value": self.value.export()
    }

  def format(self):
    return f"\033]8;;{self.url}\033\\{self.value.format()}\033]8;;\033\\"

@dataclass(slots=True)
class RichTextStrong(BaseRichTextExplicitComponent):
  value: 'RichText'

  def __init__(self, *components: RichTextComponent):
    self.value = RichText(*components)

  def export(self) -> object:
    return {
      "type": "strong",
      "value": self.value.export()
    }

  def format(self):
    return f"\033[1m{self.value.format()}\033[0m"


@dataclass(slots=True)
class RichText:
  components: tuple[RichTextComponent, ...]

  def __init__(self, *components: RichTextComponent):
    self.components = components

  def export(self) -> object:
    return [component.export() if isinstance(component, BaseRichTextExplicitComponent) else component for component in self.components]

  def format(self):
    return str().join(component.format() if isinstance(component, BaseRichTextExplicitComponent) else component for component in self.components)


__all__ = [
  'BaseRichTextExplicitComponent',
  'RichText',
  'RichTextCode',
  'RichTextComponent',
  'RichTextLink',
  'RichTextStrong'
]


if __name__ == "__main__":
  t = RichText(
    'Hello ',
    RichTextStrong('world'),
    ' ',
    RichTextCode('print("Hello ', RichTextStrong('world'), '")')
  )

  print(t)
  print(t.format())
  print(t.export())
