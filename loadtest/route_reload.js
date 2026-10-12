import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const failedRequests = new Counter('route_reload_failed_requests');
const baseURL = __ENV.BASE_URL || 'http://localhost:8080';
const token = __ENV.TOKEN || '';

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '60s',
  thresholds: {
    route_reload_failed_requests: ['count==0'],
  },
};

export default function () {
  const response = http.get(`${baseURL}/users`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    tags: { test: 'route-reload' },
  });
  const passed = check(response, {
    'route remains available during reload': (result) => result.status === 200,
  });
  if (!passed) {
    failedRequests.add(1);
  }
  sleep(0.1);
}
