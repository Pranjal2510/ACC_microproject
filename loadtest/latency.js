import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const directLatency = new Trend('direct_latency_ms', true);
const gatewayLatency = new Trend('gateway_latency_ms', true);
const directURL = __ENV.DIRECT_URL || 'http://localhost:9001/users';
const gatewayURL = __ENV.GATEWAY_URL || 'http://localhost:8080/users';
const token = __ENV.TOKEN || '';

export const options = {
  vus: Number(__ENV.VUS || 5),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    direct_latency_ms: ['p(99)<1000'],
    gateway_latency_ms: ['p(99)<1000'],
  },
};

export default function () {
  const direct = http.get(directURL, { tags: { path: 'direct' } });
  directLatency.add(direct.timings.duration);
  check(direct, { 'direct service responds': (response) => response.status === 200 });

  const gateway = http.get(gatewayURL, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    tags: { path: 'gateway' },
  });
  gatewayLatency.add(gateway.timings.duration);
  check(gateway, { 'gateway responds': (response) => response.status === 200 });

  sleep(0.1);
}
