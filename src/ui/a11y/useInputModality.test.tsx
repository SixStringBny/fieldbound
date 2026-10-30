import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useInputModality } from './useInputModality';

describe('useInputModality', () => {
  it('reports no modality before the first input', () => {
    const { result } = renderHook(() => useInputModality());

    expect(result.current.current).toBeNull();
  });

  it('records the pointer that pressed a control', () => {
    const { result } = renderHook(() => useInputModality());

    fireEvent.pointerDown(document.body);

    expect(result.current.current).toBe('pointer');
  });

  it('records a typed key as keyboard input', () => {
    const { result } = renderHook(() => useInputModality());

    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(result.current.current).toBe('keyboard');
  });

  it('ignores a modifier held on its own', () => {
    const { result } = renderHook(() => useInputModality());

    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document.body, { key: 'Shift' });
    fireEvent.keyDown(document.body, { key: 'Control' });
    fireEvent.keyDown(document.body, { key: 'Meta' });

    expect(
      result.current.current,
      'holding a modifier must not claim the route change was keyboard-driven',
    ).toBe('pointer');
  });

  it('stops observing once the owning component unmounts', () => {
    const { result, unmount } = renderHook(() => useInputModality());
    const modality = result.current;

    fireEvent.keyDown(document.body, { key: 'Tab' });
    unmount();
    fireEvent.pointerDown(document.body);

    expect(modality.current).toBe('keyboard');
  });
});
