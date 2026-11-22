// Keyboard and mouse input: pointer lock, held keys, mouse deltas per frame, and
// one-shot presses. Nothing here touches the game state; systems read from it.

const KEY_ALIASES = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Space: 'jump',
  KeyE: 'enter',
  KeyQ: 'weapon',
  KeyR: 'reload',
  KeyF: 'horn',
  Escape: 'pause',
  KeyM: 'mute',
  Enter: 'confirm',
  Tab: 'map',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.pressedThisFrame = new Set();
    this.mouse = { dx: 0, dy: 0, down: false, clickedThisFrame: false, rightDown: false };
    this.pointerLocked = false;
    this.enabled = true;
    this.sensitivity = 0.0022;
    this.wantPointerLock = false;
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      const name = KEY_ALIASES[e.code];
      if (!name) return;
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (!this.held.has(name)) this.pressedThisFrame.add(name);
      this.held.add(name);
    });
    window.addEventListener('keyup', (e) => {
      const name = KEY_ALIASES[e.code];
      if (!name) return;
      this.held.delete(name);
    });
    window.addEventListener('blur', () => this.held.clear());

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouse.clickedThisFrame = true;
      }
      if (e.button === 2) this.mouse.rightDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rightDown = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });
    this.canvas.addEventListener('click', () => {
      if (this.wantPointerLock && !this.pointerLocked) this.canvas.requestPointerLock?.();
    });
  }

  requestLock() {
    this.wantPointerLock = true;
    try {
      const maybePromise = this.canvas.requestPointerLock?.();
      // Chrome rejects the promise when the document is not yet active: harmless
      if (maybePromise && typeof maybePromise.catch === 'function') maybePromise.catch(() => {});
    } catch {
      /* browsers without pointer lock still work via drag-look fallback */
    }
  }

  releaseLock() {
    this.wantPointerLock = false;
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  isDown(action) {
    return this.enabled && this.held.has(action);
  }

  wasPressed(action) {
    return this.enabled && this.pressedThisFrame.has(action);
  }

  /** Called once per frame *after* all systems have read input. */
  endFrame() {
    this.pressedThisFrame.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.clickedThisFrame = false;
  }

  /** Mouse look delta in radians this frame (only while pointer locked or dragging). */
  lookDelta() {
    return { yaw: -this.mouse.dx * this.sensitivity, pitch: -this.mouse.dy * this.sensitivity };
  }
}

/** Axis from held movement keys: {x: right, z: forward}. */
export function movementAxis(input) {
  let x = 0;
  let z = 0;
  if (input.isDown('forward')) z += 1;
  if (input.isDown('back')) z -= 1;
  if (input.isDown('right')) x += 1;
  if (input.isDown('left')) x -= 1;
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; }
  return { x, z };
}