import bcrypt
import json

from pr1.util import schema as sc


# password_message_schema = sc.Schema({
#   'password': str
# })

class PasswordAgent:
  name = 'password'
  conf_schema = sc.Schema({
    'type': name,
    'password': str,
    'hashed': sc.Optional(sc.ParseType(bool))
  })

  def __init__(self, conf):
    self._conf = conf

  def test(self, message):
    return bcrypt.checkpw(message['password'].encode("utf-8"), self._conf['password'].encode("utf-8"))

  def export(self):
    return {
      "type": self.name,
      "description": self._conf.get('description') or "Password authentication"
    }

  def update_conf(conf):
    # if (not password.startswith("$2")) or (len(password) != 60):
    if not conf.get('hashed'):
      return {
        **conf,
        'password': bcrypt.hashpw(conf['password'].encode("utf-8"), bcrypt.gensalt()).decode("utf-8"),
        'hashed': True
      }


agents = {
  Agent.name: Agent
  for Agent in [PasswordAgent]
}
