import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeMarkdownV2,
  escapeMarkdownV2Code,
  escapeMarkdownV2Link,
  toMarkdownV2,
  htmlToMarkdownV2,
  stripMarkdown,
  md,
  raw
} from '../../lib/framework/markdown.js';
import { validateMarkdownV2 } from '../whitebox_helper.mjs';

describe('Framework unit_markdown', () => {

  test('Markdown escaping basics', () => {
    const reserved = '_*[]()~`>#+-=|{}.!';
    const escaped = escapeMarkdownV2(reserved);
    assert.equal(
      escaped,
      '\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!',
      'All regular MarkdownV2 reserved characters must be backslash-escaped'
    );

    const codeSegment = 'const x = `hello` \\ "world";';
    const escapedCode = escapeMarkdownV2Code(codeSegment);
    assert.equal(escapedCode, 'const x = \\`hello\\` \\\\ "world";');
    assert.equal(escapeMarkdownV2Code('\\`test\\`'), '\\\\\\`test\\\\\\`');

    const url = 'https://example.com/path(test)value';
    const escapedUrl = escapeMarkdownV2Link(url);
    assert.ok(escapedUrl.includes('\\)'), 'Closing paren escaped');
    assert.ok(!escapedUrl.includes('\\('), 'Opening paren NOT escaped');
    assert.ok(!escapedUrl.includes('\\.'), 'Dot NOT escaped');

    assert.equal(escapeMarkdownV2Link(null), '');
    assert.equal(escapeMarkdownV2Link(undefined), '');
  });

  test('toMarkdownV2', () => {
    const rawMarkdown = 'Hello! *this is bold* and [this is a link](https://test.com) - awesome.';
    assert.equal(toMarkdownV2(rawMarkdown), 'Hello\\! *this is bold* and [this is a link](https://test.com) \\- awesome\\.');

    const preEscaped = 'Pre\\-escaped\\. Text';
    assert.equal(toMarkdownV2(preEscaped), 'Pre\\-escaped\\. Text');
    assert.ok(!toMarkdownV2('Price is \\$100\\.00 today').includes('\\\\$'), 'No double escaping');

    assert.ok(toMarkdownV2('- First item\n- Second').includes('• First item'));
    assert.ok(toMarkdownV2('* Star item').includes('• Star item'));
    assert.ok(toMarkdownV2('+ Plus item').includes('• Plus item'));
    assert.equal(toMarkdownV2('  - Space'), '  • Space');
    assert.equal(toMarkdownV2('\t* Tab'), '\t• Tab');

    assert.ok(toMarkdownV2('```json\n{"a":1}\n```').includes('```json'));
    assert.ok(!toMarkdownV2('```json\n{"a":1}\n```').includes('\\{'));
    assert.ok(toMarkdownV2('Run `cmd` now').includes('`cmd`'));
    assert.equal(toMarkdownV2(null), '');
    assert.equal(toMarkdownV2(undefined), '');

    assert.ok(toMarkdownV2('*Hello. World!*').includes('\\.'));

    const wikiLink = '[Wikipedia](https://en.wikipedia.org/wiki/Equation_(mathematics))';
    assert.equal(toMarkdownV2(wikiLink), '[Wikipedia](https://en.wikipedia.org/wiki/Equation_(mathematics\\))');

    assert.equal(toMarkdownV2('*bold without end'), '\\*bold without end');
    assert.equal(toMarkdownV2('_italic without end'), '\\_italic without end');
    assert.equal(toMarkdownV2('`code without end'), '\\`code without end');
    assert.equal(toMarkdownV2('[stray bracket'), '\\[stray bracket');
    assert.equal(toMarkdownV2('[link](url without end'), '\\[link\\]\\(url without end');
    assert.equal(toMarkdownV2('*Bot Settings → *Allow Groups*'), '*Bot Settings → *Allow Groups\\*');
  });

  test('htmlToMarkdownV2', () => {
    assert.equal(htmlToMarkdownV2('<b>Hello</b> <i>World</i>'), '*Hello* _World_');
    assert.equal(htmlToMarkdownV2('<code>const x = 5;</code>'), '`const x = 5;`');
    assert.equal(htmlToMarkdownV2('<pre>Code block</pre>'), '```\nCode block\n```');
    assert.equal(htmlToMarkdownV2('<pre><code class="language-json">{"ok":true}</code></pre>'), '```json\n{"ok":true}\n```');
    assert.equal(htmlToMarkdownV2('<a href="https://example.com">Example</a>'), '[Example](https://example.com)');
    assert.equal(htmlToMarkdownV2('&lt;hello&gt; &amp;'), '<hello\\> &');
    assert.equal(htmlToMarkdownV2('A &lt;b&gt; &amp; C'), 'A <b\\> & C');
    assert.equal(htmlToMarkdownV2(''), '');
    assert.equal(htmlToMarkdownV2(null), '');
  });

  test('Help escaping and stripping', () => {
    const textWithLinks = 'Toggle modes (_Groups_, [_Secretary_](https://tips/sec), [_Guest_](https://tips/guest))!';
    const formatted = toMarkdownV2(textWithLinks);
    assert.equal(
      formatted,
      'Toggle modes \\(_Groups_, [_Secretary_](https://tips/sec), [_Guest_](https://tips/guest)\\)\\!',
      'Should keep underscores for italicized text and keep Markdown links intact while escaping other characters'
    );

    const markdownText = 'This is *bold* and [_italic link_](https://url) with `code` block';
    assert.equal(
      stripMarkdown(markdownText),
      'This is bold and italic link with code block',
      'Should strip Markdown links, bold, italic, code formatting, and backslashes'
    );
  });

  test('Mock MarkdownV2 validator', () => {
    assert.throws(() => validateMarkdownV2('Version 1.0 released'), /can't parse entities/);
    assert.throws(() => validateMarkdownV2('Hello! World'), /can't parse entities/);
    assert.throws(() => validateMarkdownV2('Step-by-step guide'), /can't parse entities/);
    assert.doesNotThrow(() => validateMarkdownV2('Version 1\\.0 released'));
    assert.doesNotThrow(() => validateMarkdownV2('See ```\nfile.txt\n``` above'));
    assert.doesNotThrow(() => validateMarkdownV2('Run `node index.js` now'));
    assert.doesNotThrow(() => validateMarkdownV2('[click here](https://example.com/path.html)'));
    assert.doesNotThrow(() => validateMarkdownV2('||secret text||'));
    assert.doesNotThrow(() => validateMarkdownV2('*Bold title* and _italic_'));
    assert.doesNotThrow(() => validateMarkdownV2('*Отображение тех\\. данных:*'));
    assert.throws(() => validateMarkdownV2('*Отображение тех. данных:*'), /can't parse entities/);
  });

  test('md tagged template literal and raw wrapper', () => {
    const name = 'John-Doe';
    const url = 'https://example.com/path-with-dashes';
    const unescapedHeader = 'Warning!';

    const output1 = md`Hello *${name}*! Visit [website](${raw(escapeMarkdownV2Link(url))})`;
    assert.equal(
      output1,
      'Hello *John\\-Doe*! Visit [website](https://example.com/path-with-dashes)',
      'Dynamic variables must be escaped, while static Markdown is preserved'
    );

    const output2 = md`${raw(unescapedHeader)} User is ${name}`;
    assert.equal(
      output2,
      'Warning! User is John\\-Doe',
      'RawMarkdown must bypass escaping, while other variables are escaped'
    );
  });
});
