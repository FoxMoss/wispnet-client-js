
export class Socket {
  // loopback: (send: (data) => void, registerListener: (callback) => void, exit: () => void) => {
  //
  // }
  constructor(loopback) {
    this.loopback = loopback;
  }
  // const streamSend = createStream((data) => {
  //  send(data);
  // })
  // streamSend("GET");
  createStream(externalReceive) {
    const stream = new Stream();
    this.loopback(stream);
    stream.externalListenReceive(externalReceive)

    return { send: stream.externalSend, exit: stream.exit };
  }


}


export class Stream {
  constructor() {
    this.externalListeners = [];
    this.internalListeners = [];
    this.exited = false;

    this.exit = () => {
      this.externalListeners.forEach(listener => {
        listener(false);
      });
      this.internalListeners.forEach(listener => {
        listener(false);
      });
    }

    // server data
    this.internalSend = (data) => {
      this.externalListeners.forEach(listener => {
        listener(data);
      });
    }
    this.internalListenReceive = (callback) => {
      this.internalListeners.push(callback);
    }

    // client data
    this.externalSend = (data) => {
      this.internalListeners.forEach(listener => {
        listener(data);
      });
    }
    this.externalListenReceive = (callback) => { this.externalListeners.push(callback) }
  }
}

