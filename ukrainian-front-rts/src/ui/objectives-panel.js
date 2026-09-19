function captureAttribute(element, name) {
  return element.hasAttribute(name) ? element.getAttribute(name) : null;
}

function restoreAttribute(element, name, value) {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

export function installObjectivesPanel({
  button,
  panel,
  documentTarget = globalThis.document,
} = {}) {
  if (!button?.addEventListener || !panel?.classList || !panel.id) {
    throw new TypeError('Objectives panel requires a toggle button and an identified panel.');
  }
  if (!documentTarget?.addEventListener) {
    throw new TypeError('Objectives panel requires a document event target.');
  }

  const initial = {
    hidden: panel.classList.contains('hidden'),
    controls: captureAttribute(button, 'aria-controls'),
    expanded: captureAttribute(button, 'aria-expanded'),
    ariaHidden: captureAttribute(panel, 'aria-hidden'),
  };

  const isOpen = () => !panel.classList.contains('hidden');
  const setOpen = (open, { restoreFocus = false } = {}) => {
    panel.classList.toggle('hidden', !open);
    button.setAttribute('aria-expanded', String(open));
    panel.setAttribute('aria-hidden', String(!open));
    if (!open && restoreFocus) button.focus?.({ preventScroll: true });
    return open;
  };

  const toggle = () => setOpen(!isOpen());
  const close = ({ restoreFocus = false } = {}) => setOpen(false, { restoreFocus });
  const open = () => setOpen(true);

  const onToggle = () => toggle();
  const onKeyDown = (event) => {
    if (event.key !== 'Escape' || !isOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    close({ restoreFocus: true });
  };

  button.setAttribute('aria-controls', panel.id);
  setOpen(!initial.hidden);
  button.addEventListener('click', onToggle);
  documentTarget.addEventListener('keydown', onKeyDown, true);

  let disposed = false;
  return Object.freeze({
    open,
    close,
    toggle,
    isOpen,
    dispose() {
      if (disposed) return false;
      disposed = true;
      button.removeEventListener('click', onToggle);
      documentTarget.removeEventListener('keydown', onKeyDown, true);
      panel.classList.toggle('hidden', initial.hidden);
      restoreAttribute(button, 'aria-controls', initial.controls);
      restoreAttribute(button, 'aria-expanded', initial.expanded);
      restoreAttribute(panel, 'aria-hidden', initial.ariaHidden);
      return true;
    },
  });
}
