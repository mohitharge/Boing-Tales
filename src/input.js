// Keyboard + touch input. `jumpPressed` is an edge flag the game consumes.

export const input = {
  left: false,
  right: false,
  jump: false,
  jumpPressed: false,
};

const KEYMAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'jump',
  ArrowUp: 'jump',
  KeyW: 'jump',
};

const touchHeld = { left: 0, right: 0, jump: 0 };

function press(action) {
  if (action === 'jump' && !input.jump) input.jumpPressed = true;
  input[action] = true;
}

function release(action) {
  input[action] = false;
}

export function initInput(onKey) {
  window.addEventListener('keydown', (e) => {
    const action = KEYMAP[e.code];
    if (action) {
      e.preventDefault();
      if (!e.repeat) press(action);
    }
    onKey?.(e);
  });
  window.addEventListener('keyup', (e) => {
    const action = KEYMAP[e.code];
    if (action) release(action);
  });
  window.addEventListener('blur', () => {
    input.left = input.right = input.jump = false;
  });

  document.querySelectorAll('.touch-btn').forEach((btn) => {
    const action = btn.dataset.key;
    const down = (e) => {
      e.preventDefault();
      btn.setPointerCapture?.(e.pointerId);
      touchHeld[action]++;
      btn.classList.add('active');
      press(action);
    };
    const up = (e) => {
      e.preventDefault();
      touchHeld[action] = Math.max(0, touchHeld[action] - 1);
      if (!touchHeld[action]) {
        btn.classList.remove('active');
        release(action);
      }
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  });
}

export function consumeJump() {
  const p = input.jumpPressed;
  input.jumpPressed = false;
  return p;
}

export const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
