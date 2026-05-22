class EventManager {
  constructor() {
    this.listeners = [];
  }

  addEventListener(element, eventType, handler) {
    const wrappedHandler = (event) => {
      console.log('Processing event for', element.id);
      handler(event);
    };
    
    element.addEventListener(eventType, wrappedHandler);
    this.listeners.push({ element, eventType, wrappedHandler });
  }

  removeAllListeners() {
    this.listeners.forEach(({ element, eventType, wrappedHandler }) => {
      element.removeEventListener(eventType, wrappedHandler);
    });
    this.listeners = [];
  }
}

const manager = new EventManager();
function attachListenersToElements(elements) {
  elements.forEach(element => {
    manager.addEventListener(element, 'click', function() {
      console.log('Clicked element', element.id, 'in set of', elements.length);
    });
  });
}