import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchInput } from '../src/components/common/SearchInput';

/**
 * Fills the field the way an input method does: the value is set through the property React tracks,
 * and the input event says whether what it holds is still a draft.
 */
function typeInto(input: HTMLElement, value: string, isComposingText: boolean) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  const event = new Event('input', { bubbles: true });
  Object.defineProperty(event, 'isComposing', { value: isComposingText });
  fireEvent(input, event);
}

function Field({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = React.useState('');
  return (
    <SearchInput
      label="Search"
      value={value}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

// '\u4F60\u597D' is the CJK text a pinyin input method commits for "nihao", escaped to keep the source English only.
describe('SearchInput', () => {
  it('hears the text an input method commits, not the draft it composes', () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Search' });

    fireEvent.compositionStart(input);
    typeInto(input, 'ni', true);
    expect(onChange).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('ni');

    typeInto(input, 'nihao', true);
    expect(onChange).not.toHaveBeenCalled();

    // The input method commits: the field holds the text, and the page hears it once.
    typeInto(input, '\u4F60\u597D', false);
    expect(onChange).toHaveBeenLastCalledWith('\u4F60\u597D');
    expect((input as HTMLInputElement).value).toBe('\u4F60\u597D');
  });

  it('filters on the text a hand types when no input method is composing', () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Search' });

    typeInto(input, 'cla', false);
    expect(onChange).toHaveBeenLastCalledWith('cla');
    expect((input as HTMLInputElement).value).toBe('cla');
  });

  it('commits a composition through compositionend, with no input after it', () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Search' });

    // Chromium's commit path: the last input still belongs to the composition, and the end of the
    // composition is the only thing left to tell the page the text is finished.
    fireEvent.compositionStart(input);
    typeInto(input, 'nihao', true);
    fireEvent.compositionEnd(input);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('nihao');
  });

  it('does not hear the input that ends a composition as a second edit', () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Search' });

    fireEvent.compositionStart(input);
    typeInto(input, 'ni', true);
    typeInto(input, '\u4F60\u597D', true);
    fireEvent.compositionEnd(input);
    // The input a composition ends with carries the text the page already heard; the page hears
    // one edit, not two.
    typeInto(input, '\u4F60\u597D', false);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('\u4F60\u597D');
  });

  it('commits a draft the input method ended without announcing', () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Search' });

    fireEvent.compositionStart(input);
    typeInto(input, 'quota', true);
    fireEvent.blur(input);

    expect(onChange).toHaveBeenLastCalledWith('quota');
  });
});
