import { RichText } from 'pr1-shared';


export function formatRichText(richText: RichText) {
  return richText.map((component, index) => {
    if (typeof component === 'string') {
      return component;
    }

    switch (component.type) {
      case 'code':
        return <code key={index}>{formatRichText(component.value)}</code>
      case 'link':
        return <a href={component.url} key={index}>{formatRichText(component.value)}</a>
      case 'strong':
        return <strong key={index}>{formatRichText(component.value)}</strong>
    }
  });
}
