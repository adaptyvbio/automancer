def force_parse(value, *, parsers, context, expect_type = None):
  for parser in parsers:
    result = parser(value, context=context)

    if result:
      length, data = result

      if length == len(value):
        if expect_type:
          if data['type'] != expect_type:
            raise Exception(f"Invalid expression type of '{value}', found '{data['type']}', expected '{expect_type}'")

          return data['value']

        return data
      else:
        break

  raise Exception(f"Unexpected expression '{value}'")
