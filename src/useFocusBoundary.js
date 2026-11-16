import {useEffect, useRef} from 'react';
export function useFocusBoundary(active = true, trapFocus = true) {
  const ref = useRef(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    const root = ref.current, previous = document.activeElement;
    const candidates = () => [...root.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"], summary')].filter(e => e.getClientRects().length);
    (root.querySelector('[autofocus]') || candidates()[0] || root).focus({preventScroll:true});
    function trap(e) {
      if (!trapFocus || e.key !== 'Tab') return;
      const items = candidates(), first = items[0], last = items.at(-1);
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus({preventScroll:true}); }
      else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { e.preventDefault(); first.focus({preventScroll:true}); }
    }
    root.addEventListener('keydown', trap);
    return () => { root.removeEventListener('keydown', trap); if (previous?.isConnected) previous.focus({preventScroll:true}); };
  }, [active, trapFocus]);
  return ref;
}
