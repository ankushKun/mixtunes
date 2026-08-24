/**
 * DOM helpers that avoid assigning to Element.innerHTML / insertAdjacentHTML.
 * AMO's addons-linter flags those APIs even when the HTML is trusted or escaped.
 */

function clearHtml(el) {
  if (el) el.replaceChildren();
}

/** Replace el's children with nodes parsed from an HTML string. */
function setHtml(el, html) {
  if (!el) return;
  if (html == null || html === "") {
    el.replaceChildren();
    return;
  }
  const doc = new DOMParser().parseFromString(String(html), "text/html");
  el.replaceChildren(...doc.body.childNodes);
}

/**
 * Like setHtml, but for <tr>/<td> fragments that need a table parsing context
 * (browsers otherwise hoist orphan rows out of body).
 */
function setTableHtml(el, html) {
  if (!el) return;
  if (html == null || html === "") {
    el.replaceChildren();
    return;
  }
  const doc = new DOMParser().parseFromString(
    `<table><tbody>${html}</tbody></table>`,
    "text/html"
  );
  el.replaceChildren(...doc.querySelector("tbody").childNodes);
}

/** insertAdjacentHTML("afterend", html) without using that API. */
function insertHtmlAfter(node, html) {
  if (!node || html == null || html === "") return;
  const doc = new DOMParser().parseFromString(String(html), "text/html");
  let ref = node;
  for (const child of [...doc.body.childNodes]) {
    ref.after(child);
    ref = child;
  }
}
