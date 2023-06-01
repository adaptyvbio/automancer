from pprint import pprint
import pr1 as am
from ..fiber.eval import EvalContext, EvalEnvs
from ..document import Document
from ..fiber.parser import AnalysisContext
from ..reader import loads2

analysis, data = loads2(Document.text("""
foo: qux
bar:
  - ${{ x + 35 }}
  - 2
  - 28
""").source)

data_type = am.RecordType({
  'foo': am.StrType(),
  'bar': am.ListType(am.IntType())
})

context = AnalysisContext(
  auto_expr=True,
  envs_list=[EvalEnvs()],
  eval_depth=1
)

analysis, result = data_type.analyze(data, context)
pprint(analysis.errors)

# analysis, result = result(context.eval_context)

print(result)
# print(result.evaluate(context.eval_context)[1].dislocate())

print("---")

analysis, result = result.evaluate(EvalContext(stack={}))
pprint(analysis.errors)

print(result)
