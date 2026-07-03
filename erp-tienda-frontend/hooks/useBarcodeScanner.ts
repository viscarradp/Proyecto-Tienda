import { useEffect, useRef } from 'react';

type BarcodeCallback = (barcode: string) => void;

interface UseBarcodeScannerOptions {
  onScan: BarcodeCallback;
  enabled?: boolean;
}

export function useBarcodeScanner({ onScan, enabled = true }: UseBarcodeScannerOptions) {
  const buffer = useRef('');
  const lastKeyTime = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input (we don't want global scan if focusing purposefully in a text area)
      // EXCEPT if we want the scanner to work even when focused on an input?
      // For POS, we usually want the scanner to work universally UNLESS it's a number/text input
      // Let's only ignore if it's explicitly an INPUT or TEXTAREA
      // But wait! If they are focused on the POS search bar, scanning will put the text there.
      // A genuine barcode scanner types fast. If we clear the buffer on slow typing, it won't trigger onScan.
      // But if they scan while in the search bar, the text appears in the search bar AND onScan fires.
      // To prevent text appearing in the search bar, we'd have to preventDefault on every single key,
      // which ruins normal typing. 
      // So standard behavior: if focused on Input/Textarea, we let them type natively. The scanner will just type into the search bar.
      // If we *really* want the POS to always catch it:
      const activeTag = document.activeElement?.tagName.toUpperCase() || '';
      const isInputFocused = ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag);

      // We will allow the scanner to work even if an input is focused, BUT we won't prevent default characters.
      // Wait, if an input is focused, the user might be scanning a barcode INTO that input (e.g. searching by barcode).
      // So if an input is focused, we just abort this global hook and let the input handle it natively.
      if (isInputFocused) {
        return;
      }

      const currentTime = Date.now();
      
      // If time between keystrokes is (> 30ms), it's human typing. Reset buffer.
      if (currentTime - lastKeyTime.current > 30) {
        buffer.current = '';
      }

      if (e.key === 'Enter') {
        if (buffer.current.length > 0) {
          onScan(buffer.current);
          buffer.current = '';
          e.preventDefault();
        }
        return;
      }

      // Add normal character
      if (e.key.length === 1) {
        buffer.current += e.key;
      }

      lastKeyTime.current = currentTime;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onScan, enabled]);
}
