import mdns from 'multicast-dns';


export interface Service {
  address: {
    domain: string;
    ipv4: string | null;
    ipv6: string | null;
    port: number;
  } | null;
  name: string;
  properties: Record<string, string> | null;
  types: string[];
}

export type Services = Record<Service['name'], Service>;


type GeneralRecordEntries = Record<string, { data: any; expires: number; }>;
type PTRRecordEntries = Record<string, Record<string, { expires: number; }>>;

export class Scanner {
  private _debounceDelay = 400;
  private _instance = mdns();
  private _listeners = new Set<{
    callback(services: Services): void;
    types: string[];
  }>();
  private _records: {
    A: GeneralRecordEntries;
    AAAA: GeneralRecordEntries;
    PTR: PTRRecordEntries;
    SRV: GeneralRecordEntries;
    TXT: GeneralRecordEntries;
  } = {
    A: {},
    AAAA: {},
    PTR: {},
    SRV: {},
    TXT: {}
  };
  private _timeout: ReturnType<typeof setTimeout>  | null = null;

  constructor() {
    this._instance.on('response', (response) => {
      let now = Date.now();

      for (let record of [
        ...(response.answers ?? []),
        ...(response.additionals ?? [])
      ]) {
        let expires = now + (record as any).ttl * 1000;

        if (record.type === 'PTR') {
          if (!(record.name in this._records.PTR)) {
            this._records.PTR[record.name] = {};
          }

          this._records.PTR[record.name][record.data] = { expires };
        } else if (record.type in this._records) {
          this._records[record.type as 'A'][record.name] = {
            data: (record as any).data,
            expires
          }
        }
      }

      if (this._debounceDelay > 0) {
        if (this._timeout !== null) {
          clearTimeout(this._timeout);
        }

        this._timeout = setTimeout(() => {
          this._timeout = null;
          this._callListeners();
        }, this._debounceDelay);
      } else {
        this._callListeners();
      }
    });
  }

  private _callListeners() {
    if (this._listeners.size > 0) {
      this._cleanup();
    }

    for (let listener of this._listeners) {
      listener.callback(this._listServices(listener.types));
    }
  }

  private _cleanup() {
    let now = Date.now();

    for (let entries of Object.values(this._records.PTR)) {
      for (let [name, { expires }] of Object.entries(entries)) {
        if (expires < now) {
          delete entries[name];
        }
      }
    }

    for (let recordType of ['A', 'AAAA', 'SRV', 'TXT']) {
      let entries = this._records[recordType as 'A'];

      for (let [name, { expires }] of Object.entries(entries)) {
        if (expires < now) {
          delete entries[name];
        }
      }
    }
  }

  private _listServices(types: string[]) {
    let services: Services = {};

    for (let type of types) {
      for (let name of Object.keys(this._records.PTR[type] ?? {})) {
        if (!(name in services)) {
          services[name] = {
            address: null,
            name,
            properties: null,
            types: []
          };
        }

        services[name].types.push(type);
      }
    }

    for (let service of Object.values(services)) {
      let srv = this._records.SRV[service.name];
      let txt = this._records.TXT[service.name];

      if (srv) {
        service.address = {
          domain: srv.data.target,
          ipv4: null,
          ipv6: null,
          port: srv.data.port
        };

        let a = this._records.A[service.address.domain];
        let aaaa = this._records.AAAA[service.address.domain];

        if (a) {
          service.address.ipv4 = a.data;
        }

        if (aaaa) {
          service.address.ipv6 = aaaa.data;
        }
      }

      if (txt) {
        service.properties = {};

        for (let pair of txt.data) {
          if (pair.length > 0) {
            let [key, ...value] = pair.toString().split('=');
            service.properties[key] = value.join('=');
          }
        }
      }
    }

    return services;
  }

  close() {
    if (this._timeout !== null) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }

    this._instance.destroy();
    this._listeners.clear();
  }

  async getServices(types: string[], options?: { queryDelay?: number; }) {
    let queryDelay = (options?.queryDelay ?? 800);

    if (queryDelay > 0) {
      await this.queryServices(types);
      await new Promise<void>((resolve) => void setTimeout(() => void resolve(), queryDelay));
    }

    return this.listServices(types);
  }

  async queryServices(types: string[]) {
    await new Promise<void>((resolve, reject) => {
      this._instance.query(
        types.map((type) => ({ name: type, type: 'PTR', class: 'IN' })),
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  listServices(types: string[]) {
    this._cleanup();
    return this._listServices(types);
  }

  listenToServices(callback: ((services: Services) => void), types: string[], options?: { signal?: AbortSignal; }) {
    let listener = {
      callback,
      types
    };

    this._listeners.add(listener);

    options?.signal?.addEventListener('abort', () => {
      this._listeners.delete(listener);
    });
  }

  static async getServices(types: string[], options?: { queryDelay?: number; }) {
    let scanner = new Scanner();
    let services = await scanner.getServices(types, options);

    scanner.close();

    return services;
  }
}


// let scanner = new Scanner();

// scanner.listenToServices((services) => {
//   console.log(services);
// }, [
//   '_prone._tcp.local',
//   '_prone._http._tcp.local'
// ]);
