import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

import { align, undent } from './mod.ts';
import {
  createUnicodeColumnOffset,
  defaultGraphemeWidth,
  graphemes,
  isAmbiguousWidthCodePoint,
  isCodePointInRanges,
  isControlCodePoint,
  isWideCodePoint,
  resolveUnicodeColumnOffsetOptions,
  sliceAfterLastNewline,
  unicodeColumnOffset,
  visualColumnWidth,
} from './unicode.ts';

function makeTSA(segments: string[]): TemplateStringsArray {
  return Object.assign([...segments], {
    raw: [...segments],
  }) as unknown as TemplateStringsArray;
}

describe('unicode alignment helpers', () => {
  it('measures the last line with wide characters', () => {
    expect(unicodeColumnOffset('prefix\n界 ')).toBe(3);
  });

  it('exports a resolver that merges default unicode options', () => {
    const result = resolveUnicodeColumnOffsetOptions({});

    expect(result).toEqual({
      tabWidth: false,
      ambiguous: 'narrow',
    });
  });

  it('exports a helper that slices after the last newline', () => {
    expect(sliceAfterLastNewline('alpha\r\nbeta')).toBe('beta');
  });

  it('measures the last line after CRLF as well as LF', () => {
    expect(unicodeColumnOffset('prefix\r\n界 ')).toBe(3);
  });

  it('treats combining marks as part of the same visible grapheme', () => {
    expect(visualColumnWidth('e\u0301 ')).toBe(2);
  });

  it('exports default grapheme width rules for direct use', () => {
    const options = resolveUnicodeColumnOffsetOptions({ ambiguous: 'wide' });

    expect(defaultGraphemeWidth('\t', 3, options)).toBe(1);
    expect(defaultGraphemeWidth('Ω', 0, options)).toBe(2);
  });

  it('treats emoji ZWJ sequences as a single wide grapheme', () => {
    expect(visualColumnWidth('👨‍👩‍👧‍👦')).toBe(2);
  });

  it('exports grapheme iteration for callers that need the same segmentation', () => {
    expect(Array.from(graphemes('e\u0301😀'))).toEqual(['é', '😀']);
  });

  it('treats regional-indicator flag sequences as wide', () => {
    expect(visualColumnWidth('🇯🇵')).toBe(2);
  });

  it('treats fullwidth forms as wide', () => {
    expect(visualColumnWidth('Ｈｅｌｌｏ')).toBe(10);
  });

  it('treats Unicode wide trigrams as wide after the upstream table audit', () => {
    expect(visualColumnWidth('☰')).toBe(2);
  });

  it('exports wide and ambiguous range predicates', () => {
    expect(isWideCodePoint('界'.codePointAt(0)!)).toBe(true);
    expect(isAmbiguousWidthCodePoint('Ω'.codePointAt(0)!)).toBe(true);
  });

  it('exports low-level code-point classification helpers', () => {
    expect(isControlCodePoint(0x09)).toBe(true);
    expect(isCodePointInRanges(0x03a9, [[0x0391, 0x03a9]])).toBe(true);
  });

  it('treats ambiguous-width characters as narrow by default', () => {
    expect(visualColumnWidth('Ω')).toBe(1);
  });

  it('treats ambiguous-width characters as wide when configured', () => {
    expect(visualColumnWidth('Ω', { ambiguous: 'wide' })).toBe(2);
  });

  it('lets widthOf override specific grapheme widths', () => {
    expect(
      visualColumnWidth('a·b', {
        widthOf(grapheme) {
          return grapheme === '·' ? 3 : undefined;
        },
      }),
    ).toBe(5);
  });

  it('throws when widthOf returns a negative width', () => {
    expect(() =>
      visualColumnWidth('a', {
        widthOf() {
          return -1;
        },
      })
    ).toThrow('widthOf(...) must return a non-negative integer');
  });

  it('throws when tabWidth is not a positive integer', () => {
    expect(() => createUnicodeColumnOffset({ tabWidth: 0 })).toThrow(
      '"tabWidth" must be a positive integer or false',
    );
  });

  it('supports tab stops when configured', () => {
    const columnOffset = createUnicodeColumnOffset({ tabWidth: 4 });

    expect(columnOffset('ab\t')).toBe(4);
    expect(columnOffset('abc\t')).toBe(4);
    expect(columnOffset('abcd\t')).toBe(8);
  });

  it('can treat tabs as one column when tabWidth is false', () => {
    const columnOffset = createUnicodeColumnOffset({ tabWidth: false });

    expect(columnOffset('ab\t')).toBe(3);
  });

  it('integrates with undent through the root columnOffset option', () => {
    const terminalUndent = undent.with({
      alignValues: true,
      columnOffset: createUnicodeColumnOffset(),
    });

    const result = terminalUndent`
      label: 界 ${'a\nb'}
    `;

    expect(result).toBe('label: 界 a\n          b');
  });

  it('aligns later lines to the same visual tab-stop column', () => {
    const rawAligned = undent.with({ alignValues: true });
    const visualAligned = undent.with({
      alignValues: true,
      columnOffset: createUnicodeColumnOffset({ tabWidth: 4 }),
    });
    const template = makeTSA(['\n\titems:\t', '\n']);

    expect(rawAligned(template, 'alpha\nbeta')).toBe('items:\talpha\n       beta');
    expect(visualAligned(template, 'alpha\nbeta')).toBe('items:\talpha\n        beta');
  });

  it('affects wrapped align() values as well as alignValues', () => {
    const terminalUndent = undent.with({
      columnOffset: createUnicodeColumnOffset(),
    });

    const result = terminalUndent`
      label: 界 ${align('alpha\nbeta')}
    `;

    expect(result).toBe('label: 界 alpha\n          beta');
  });

  it('handles prefixes that mix tabs and spaces before a wrapped value', () => {
    const terminalUndent = undent.with({
      columnOffset: createUnicodeColumnOffset({ tabWidth: 4 }),
    });
    const template = makeTSA(['\n\tprefix:\t ', '\n']);

    expect(terminalUndent(template, align('alpha\nbeta'))).toBe(
      'prefix:\t alpha\n         beta',
    );
  });

  it('supports custom widthOf in end-to-end alignment', () => {
    const terminalUndent = undent.with({
      alignValues: true,
      columnOffset: createUnicodeColumnOffset({
        widthOf(grapheme) {
          return grapheme === '·' ? 3 : undefined;
        },
      }),
    });

    const result = terminalUndent`
      key· ${'x\ny'}
    `;

    expect(result).toBe('key· x\n       y');
  });
});