/* eslint-disable no-magic-numbers -- slide deltas */
import { useEffect, type RefObject } from 'react';

function noop(): void {
  // Nothing to clean up.
}

function hasFiles(event: DragEvent): boolean {
  return Boolean(event.dataTransfer?.types.includes('Files'));
}

/** Dropping a file anywhere on the window opens it; reports drag-over state. */
export function useWindowDrop(
  onFile: (file: File) => void,
  onDragging: (dragging: boolean) => void,
): void {
  useEffect(() => {
    const over = (event: DragEvent) => {
      if (hasFiles(event)) {
        event.preventDefault();
        onDragging(true);
      }
    };
    const leave = (event: DragEvent) => {
      if (event.relatedTarget === null) {
        onDragging(false);
      }
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) {
        return;
      }
      event.preventDefault();
      onDragging(false);
      const file = event.dataTransfer?.files[0];
      if (file) {
        onFile(file);
      }
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [onFile, onDragging]);
}

/** Files opened through the installed app's file handler. */
export function useLaunchQueue(onFile: (file: File) => void): void {
  useEffect(() => {
    window.launchQueue?.setConsumer((params) => {
      void params.files[0]?.getFile().then(onFile);
    });
  }, [onFile]);
}

function isTextField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export interface ShortcutActions {
  help(): void;
  open(): void;
  moveSlide(delta: number | 'first' | 'last'): void;
}

function runShortcut(key: string, actions: ShortcutActions): boolean {
  const table: Record<string, () => void> = {
    '?': actions.help,
    o: actions.open,
    O: actions.open,
    ArrowUp: () => actions.moveSlide(-1),
    ArrowDown: () => actions.moveSlide(1),
    Home: () => actions.moveSlide('first'),
    End: () => actions.moveSlide('last'),
  };
  const action = table[key];
  action?.();
  return Boolean(action);
}

/** Global shortcuts; ignored inside text fields and with modifier keys. */
export function useShortcuts(actions: ShortcutActions, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return noop;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (isTextField(event.target)) {
        return;
      }
      if (runShortcut(event.key, actions)) {
        event.preventDefault();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [actions, enabled]);
}

/** Closes a modal dialog on Escape (native `cancel` is not available everywhere). */
export function useEscape(
  ref: RefObject<HTMLDialogElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) {
      return noop;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        ref.current?.close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ref, active]);
}
