import {
  WispConnection,
  WispStream,
  array_from_uint,
  concat_uint8array,
  create_packet,
  uint_from_array
} from "./wisp.mjs";
import {
  WispWebSocket,
  _wisp_connections
} from "./polyfill.mjs";

const WISPNETC_PROBE = 0x01;
const WISPNETC_OPEN = 0x02;
const WISPNETC_SERVER_DATA = 0x03;
const WISPNETC_SERVER_EXIT = 0x04;

export class WispNet extends EventTarget {
  constructor(websocket, buffer_size, stream_id, connection) {
    super();
    this.stream = new WispStream("wispnet", 0, websocket, buffer_size, stream_id, connection, 1);
    this.stream.addEventListener("message", (event) => this.handle_message(event, this));

    let type_array = array_from_uint(1, 1);
    let port_array = array_from_uint(0, 2);
    let host_array = new TextEncoder().encode("wispnet");
    let payload = concat_uint8array(type_array, port_array, host_array);
    let packet = create_packet(0x01, stream_id, payload);
    this.device_id = -1


    websocket.send(packet);

    this.stream_cache = {};

    this.discovered_ports = [];
    this.probe();
  }
  probe() {
    let packet_type_array = array_from_uint(WISPNETC_PROBE, 1);

    let packet = concat_uint8array(packet_type_array);

    this.stream.send(packet);
  }
  open_device(port, str, handler, discoveable = true) {
    this.stream_cache[port] = {};
    let packet_type_array = array_from_uint(WISPNETC_OPEN, 1);
    let port_array = array_from_uint(port, 2);
    let discoverable_array = array_from_uint(0x01, discoveable ? 1 : 0); // true
    let notes_array = new TextEncoder().encode(str);
    let packet = concat_uint8array(packet_type_array, port_array, discoverable_array, notes_array);

    this.stream_cache[port]["handler"] = handler;

    this.stream.send(packet);
  }
  handle_message(event, parent) {
    let packet = new Uint8Array(event.data);

    switch (packet[0]) {
      case 0x01:
        this.device_id = uint_from_array(packet.slice(1, 5));

        this.dispatchEvent(new MessageEvent("connected", {
          data: {
            id: this.device_id
          }
        }))
        console.log(this.device_id);
        break;
      case 0x02: {
        let cursor = 1;
        let portsFound = 0;
        while (cursor < packet.length) {
          portsFound++;
          let device_id = uint_from_array(packet.slice(cursor, cursor + 4));
          cursor += 4;
          let port = uint_from_array(packet.slice(cursor, cursor + 2));
          cursor += 2;
          let note = "";
          while (packet[cursor] != 0x00 && cursor < packet.length) {
            note += String.fromCharCode(packet[cursor]);
            cursor++;
          }
          this.discovered_ports.push({
            device_id: device_id,
            port: port,
            note: note
          });
          cursor++;
        }
        this.dispatchEvent(new MessageEvent("registry", {
          data: portsFound
        }))

        break;
      }
      case 0x03: {
        const client_id = uint_from_array(packet.slice(1, 5));
        const connection_id = uint_from_array(packet.slice(5, 9));
        const port = uint_from_array(packet.slice(10, 12));

        console.log(`Has client on port: ${port}`);

        const streamData = this.stream_cache[port]["handler"].createStream((data) => {
          if (!data) {
            this.exit_to_client(client_id, connection_id, port);
            return;
          }
          parent.send_to_client(client_id, connection_id, port, data);
        });

        if (!this.stream_cache[port][connection_id])
          this.stream_cache[port][connection_id] = {};
        this.stream_cache[port][connection_id][client_id] = streamData;

      }
        break;
      case 0x04: {
        const client_id = uint_from_array(packet.slice(1, 5));
        const connection_id = uint_from_array(packet.slice(5, 9));

        const port = uint_from_array(packet.slice(9, 11));

        this.stream_cache[port][connection_id][client_id].send({
          client: client_id,
          data: packet.slice(11, packet.length)
        })
      }
        break;

      default:
        break;
    }
  }
  send_to_client(client_id, connection_id, port, data) {
    let packet_type_array = array_from_uint(WISPNETC_SERVER_DATA, 1);

    let client_array = array_from_uint(client_id, 4);
    let connection_array = array_from_uint(connection_id, 4);
    let port_array = array_from_uint(port, 2);
    let packet = concat_uint8array(packet_type_array, client_array, connection_array, port_array, data);

    this.stream.send(packet);
  }

  exit_to_client(client_id, connection_id, port) {
    let packet_type_array = array_from_uint(WISPNETC_SERVER_EXIT, 1);

    let client_array = array_from_uint(client_id, 4);
    let connection_array = array_from_uint(connection_id, 4);
    let port_array = array_from_uint(port, 2);
    let packet = concat_uint8array(packet_type_array, client_array, connection_array, port_array);

    this.stream.send(packet);
  }
}
