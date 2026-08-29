import { digestObject, secureEquals } from '../util.mjs';
import { UnavailableError } from '../errors.mjs';

export class AndroidSidecarAdapter {
  constructor({ endpoint = 'http://127.0.0.1:8199', token, fetchImpl = fetch } = {}) {
    this.endpoint = endpoint.replace(/\/$/, '');
    this.token = token;
    this.fetch = fetchImpl;
    this.kind = 'android-sidecar';
  }

  async handshake() {
    if (!this.token) throw new UnavailableError('Android sidecar token is required');
    const response = await this.fetch(`${this.endpoint}/v1/sidecar/handshake`, { headers: { authorization: `Bearer ${this.token}` } });
    if (!response.ok) throw new UnavailableError(`Android sidecar handshake failed: ${response.status}`);
    const body = await response.json();
    if (body.protocol_version !== 1 || !body.nonce) throw new UnavailableError('Unsupported Android sidecar protocol');
    return body;
  }

  async fingerprint() {
    const body = await this.handshake();
    const details = {
      kind: this.kind,
      androidVersion: body.android_version,
      abi: body.abi,
      soc: body.soc,
      driver: body.driver,
      runtime: body.runtime,
      thermalPolicy: body.thermal_policy ?? 'unknown',
    };
    return { id: digestObject(details), details };
  }

  verifyToken(candidate) {
    return secureEquals(candidate, this.token);
  }
}
