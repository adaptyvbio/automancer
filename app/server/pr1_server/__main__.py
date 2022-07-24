import logging

logging.basicConfig(level=logging.DEBUG, format="%(levelname)-8s :: %(name)-18s :: %(message)s")

for handler in logging.root.handlers:
  handler.addFilter(logging.Filter("pr1"))


from . import main

main()
