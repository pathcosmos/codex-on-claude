class EventManager {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    // Missing: return unsubscribe function
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }
}

const eventManager = new EventManager();

function setupComponent() {
  eventManager.on('user-update', (user) => {
    console.log('User updated:', user);
  });
  // BUG: listener never unregistered, accumulates on component recreate
}

// Repeatedly called without cleanup
setupComponent();
setupComponent();
setupComponent();