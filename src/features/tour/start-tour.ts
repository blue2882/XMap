import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

export const LIBRARY_TOUR_KEY = 'mindmaps.tour.library';
export const EDITOR_TOUR_KEY = 'mindmaps.tour.editor';

const LIBRARY_STEPS: DriveStep[] = [
  {
    element: '[data-tour="library-title"]',
    popover: {
      title: 'Your maps',
      description:
        'Each card is one mind map. Tap a card to open it. This walkthrough uses the buttons on screen, so you do not need a keyboard.',
    },
  },
  {
    element: '[data-tour="new-map"]',
    popover: {
      title: 'Start a map',
      description: 'New map creates a blank one. Import brings in a JSON export or a PowerPoint deck.',
    },
  },
  {
    element: '[data-tour="sign-in"]',
    popover: {
      title: 'Save to your account',
      description: 'Until you sign in, maps stay on this device. Sign in and they sync to your account.',
    },
  },
];

const EDITOR_STEPS: DriveStep[] = [
  {
    element: '[data-tour="canvas"]',
    popover: {
      title: 'The map',
      description:
        'Drag empty space to pan. Pinch, or use the zoom buttons, to zoom. Drag a node to move that branch.',
    },
  },
  {
    element: '[data-tour="node-actions"]',
    popover: {
      title: 'Node actions',
      description:
        'With a node selected, this bar adds a child, edits the label, opens notes, links another node, or deletes. On iPad this is the way to edit. Keyboard shortcuts are optional.',
    },
  },
  {
    element: '[data-tour="reparent"]',
    popover: {
      title: 'Move under a new parent',
      description: 'Turn on Re-parent, then drag the node onto the one that should become its parent.',
    },
  },
  {
    element: '[data-tour="tidy"]',
    popover: {
      title: 'Tidy the tree',
      description:
        'Tidy places branches left, then right, then up and down, without stacking nodes on each other.',
    },
  },
  {
    element: '[data-tour="save"]',
    popover: {
      title: 'Save',
      description: 'Save writes the map on this device, and to your account when you are signed in.',
    },
  },
];

export function startLibraryTour(): void {
  drive(LIBRARY_STEPS, LIBRARY_TOUR_KEY);
}

export function startEditorTour(): void {
  drive(EDITOR_STEPS, EDITOR_TOUR_KEY);
}

export function tourSeen(key: string): boolean {
  return localStorage.getItem(key) === '1';
}

function drive(steps: DriveStep[], seenKey: string): void {
  const available = steps.filter((step) => {
    if (typeof step.element !== 'string') return true;
    const target = document.querySelector(step.element);
    return target instanceof HTMLElement && target.getClientRects().length > 0;
  });
  if (available.length === 0) return;
  const tour = driver({
    showProgress: true,
    allowClose: true,
    overlayOpacity: 0.55,
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    steps: available,
    onDestroyed: () => {
      localStorage.setItem(seenKey, '1');
    },
  });
  tour.drive();
}
