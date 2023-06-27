let oldNavigation = window.navigation;
let newNavigation = {
  currentEntry: {
    getState: () => undefined,
    url: 'file:///'
  },
  addEventListener(type: 'navigate', listener: ((event: any) => void)) {
    oldNavigation.addEventListener('navigate', (event: any) => {
      event.preventDefault();

      let defaultPrevented = false;

      listener({
        destination: event.destination,
        canIntercept: true,
        info: event.info?.info,
        intercept({ handler }: any) {
          handler();
        },
        preventDefault: () => {
          defaultPrevented = true;
        }
      });

      if (!defaultPrevented) {
        newNavigation.currentEntry = {
          getState: () => event.info?.state,
          url: event.destination.url
        };

      }
    });
  },
  navigate(url: string, options: any) {
    oldNavigation.navigate(url, {
      info: {
        info: options?.info,
        state: options?.state
      }
    }).committed.catch(() => {});
  }
};

window.navigation = newNavigation;
