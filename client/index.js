let socket = new WebSocket("ws://localhost:4567", "alpha");

socket.addEventListener('message', (event) => {
  let data = JSON.parse(event.data);

  console.log('State -->', data);
});

// socket.send()
