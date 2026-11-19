import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('');
const purifier = createDOMPurify(dom.window);

export function cleanArticle(html: string): string {
  return purifier.sanitize(html, {
    ADD_ATTR: ['data-world', 'data-location', 'data-asset'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'form'],
    FORBID_ATTR: ['srcdoc'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?):|#location$)/i,
  });
}
