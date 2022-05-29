self.addEventListener('fetch', function (event) {
  let url = new URL(event.request.url);

  if (url.origin === 'https://cdn.jsdelivr.net') {
    event.respondWith(
      caches.open('cdn').then(function (cache) {
        return cache.match(event.request).then(function (response) {
          return (
            response ||
            fetch(event.request).then(function (response) {
              cache.put(event.request, response.clone());
              return response;
            })
          );
        });
      }),
    );
  }
});
