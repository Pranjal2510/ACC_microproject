import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const fast503s = new Counter('breaker_fast_503_total');
const first503Ms = new Trend('breaker_first_503_ms');
const baseURL = __ENV.BASE_URL || 'http://localhost:8080';
const token = __ENV.TOKEN || '';
const startedAt = Date.now();
let observed503 = false;

export const options = {
  vus: Number(__ENV.VUS || 1),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    breaker_fast_503_total: ['count>0'],
  },
};

export default function () {
  const response = http.get(`${baseURL}/users`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    tags: { test: 'breaker-failfast' },
  });
  if (response.status === 503) {
    fast503s.add(1);
    if (!observed503) {
      first503Ms.add(Date.now() - startedAt);
      observed503 = true;
    }
  }
  check(response, {
    'breaker returns a response': (result) => result.status === 200 || result.status === 503 || result.status === 502,
  });
  sleep(0.1);
}
