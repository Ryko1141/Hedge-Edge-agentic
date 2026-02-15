import { useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  action: () => void;
  description: string;
}

/**
 * Global keyboard shortcuts for power users
 * 
 * Shortcuts:
 * - Ctrl+1: Go to Overview
 * - Ctrl+2: Go to Accounts
 * - Ctrl+3: Go to Analytics
 * - Ctrl+4: Go to Trade Copier
 * - Ctrl+,: Go to Settings
 * - Ctrl+/: Go to Help
 * - Ctrl+N: New Account (when on Overview/Accounts)
 * - Escape: Close modal/dialog
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();

  const shortcuts: KeyboardShortcut[] = [
    // Navigation shortcuts
    { key: '1', ctrl: true, action: () => navigate('/app'), description: 'Go to Overview' },
    { key: '2', ctrl: true, action: () => navigate('/app/accounts'), description: 'Go to Accounts' },
    { key: '3', ctrl: true, action: () => navigate('/app/analytics'), description: 'Go to Analytics' },
    { key: '4', ctrl: true, action: () => navigate('/app/copier'), description: 'Go to Trade Copier' },
    { key: ',', ctrl: true, action: () => navigate('/app/settings'), description: 'Go to Settings' },
    { key: '/', ctrl: true, action: () => navigate('/app/help'), description: 'Go to Help' },
  ];

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    for (const shortcut of shortcuts) {
      const ctrlMatch = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey;
      const altMatch = shortcut.alt ? event.altKey : !event.altKey;
      const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
      
      if (event.key === shortcut.key && ctrlMatch && altMatch && shiftMatch) {
        event.preventDefault();
        shortcut.action();
        return;
      }
    }
  }, [navigate]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { shortcuts };
}

/**
 * Get all available keyboard shortcuts for display in help
 */
export function getKeyboardShortcuts() {
  return [
    { keys: ['Ctrl', '1'], description: 'Go to Overview' },
    { keys: ['Ctrl', '2'], description: 'Go to Accounts' },
    { keys: ['Ctrl', '3'], description: 'Go to Analytics' },
    { keys: ['Ctrl', '4'], description: 'Go to Trade Copier' },
    { keys: ['Ctrl', ','], description: 'Go to Settings' },
    { keys: ['Ctrl', '/'], description: 'Go to Help' },
    { keys: ['Escape'], description: 'Close modal/dialog' },
    { keys: ['Tab'], description: 'Navigate between elements' },
    { keys: ['Enter'], description: 'Activate focused element' },
  ];
}
