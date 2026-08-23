import DOMPurify from 'dompurify';

/**
 * Sanitizes admin-authored rich text (CMS pages, blog posts) before rendering via
 * `dangerouslySetInnerHTML`. Content originates from the admin panel's CMS module
 * ( 5), not end-user input, but treating it as trusted-by-source was an
 * assumption, not a safeguard — an admin account compromise or a future
 * "suggest an edit" feature would otherwise be a stored-XSS vector. Strips
 * scripts/event-handlers/iframes while keeping the basic formatting tags CMS
 * content actually uses.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'code', 'pre',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'span', 'div',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'class'],
  });
}
