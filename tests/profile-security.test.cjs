const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/profile.js'), 'utf8');
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.textContent = ''; }
  set innerHTML(_) { throw new Error('Untrusted review must never reach an HTML sink'); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this[key] = value; }
}
function render(summary) {
  const nodes = Object.fromEntries(['profile-rating-summary', 'rate-reviews', 'rate-review-list'].map(id => [id, new Element('div')]));
  const context = { document: { getElementById: id => nodes[id], createElement: tag => new Element(tag) } };
  vm.createContext(context);
  const begin = source.indexOf('  function renderSummary(');
  const end = source.indexOf('  async function loadRatings(', begin);
  vm.runInContext(source.slice(begin, end), context);
  context.renderSummary(summary);
  return nodes;
}
test('script and SQL-like payloads remain literal text, including reviewer names', () => {
  const payload = '<img src=x onerror=alert(1)><script>alert(1)</script>\' OR 1=1 --';
  const nodes = render({count:1, average:5, reviews:[{stars:5, comment:payload, reviewerName:payload}]});
  const review = nodes['rate-review-list'].children[0];
  assert.equal(review.children[1].textContent, payload);
  assert.equal(review.children[2].textContent, payload);
});
test('invalid stars cannot trigger excessive string allocation or abort the renderer', () => {
  for (const stars of [-1, 6, 1e10, NaN, Infinity, '5', null]) {
    assert.equal(render({count:1,average:5,reviews:[{stars,comment:'Test',reviewerName:'Guest'}]})['rate-review-list'].children.length, 0);
  }
});
test('response items and strings are bounded even when the API returns malformed data', () => {
  const reviews = Array.from({length:100}, () => ({stars:4,comment:'x'.repeat(10000),reviewerName:'y'.repeat(1000)}));
  const list = render({count:100,average:4,reviews})['rate-review-list'];
  assert.equal(list.children.length,20);
  assert.equal(list.children[0].children[1].textContent.length,600);
  assert.equal(list.children[0].children[2].textContent.length,120);
});
