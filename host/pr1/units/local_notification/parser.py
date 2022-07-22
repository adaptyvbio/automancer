from . import namespace
from ..base import BaseParser


class Parser(BaseParser):
  def handle_segment(self, data_segment):
    if 'notify' in data_segment:
      message, _context = data_segment['notify']

      return {
        namespace: { 'message': message }
      }

  def export_segment(data):
    return {
      "message": data['message']
    }
