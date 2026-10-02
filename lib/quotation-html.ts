/**
 * lib/quotation-html.ts  (server only)
 *
 * Sanitises the HTML of a quotation template before it is stored. Templates come from the rich editor or
 * from imported Word documents, and the stored HTML is later shown to other users and copied into emails,
 * so only a conservative allow-list of tags / attributes / styles is kept. Scripts, event handlers,
 * iframes, forms and javascript: links are removed.
 */
import sanitizeHtml from "sanitize-html"

const SAFE_VALUE = /^[#\w\s.,%()\-"'/]+$/
const style = (...props: string[]) => Object.fromEntries(props.map((p) => [p, [SAFE_VALUE]]))
const STYLES = style(
  "color", "background-color", "background", "font-size", "font-weight", "font-style", "font-family", "text-align",
  "text-decoration", "line-height", "vertical-align", "width", "height", "min-width", "max-width", "white-space",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border", "border-top", "border-right", "border-bottom", "border-left", "border-collapse", "border-color", "border-width", "border-style",
)

export function sanitizeQuotationHtml(html: string): string {
  return sanitizeHtml(html ?? "", {
    allowedTags: [
      "p", "br", "div", "span", "h1", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "sub", "sup",
      "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "colgroup", "col",
      "a", "hr", "img", "blockquote", "pre", "code",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      table: ["border", "cellpadding", "cellspacing", "width", "style"],
      td: ["colspan", "rowspan", "width", "align", "valign", "style"],
      th: ["colspan", "rowspan", "width", "align", "valign", "style"],
      col: ["width", "span"],
      "*": ["style"],
    },
    allowedStyles: { "*": STYLES },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" } }),
    },
  })
}
