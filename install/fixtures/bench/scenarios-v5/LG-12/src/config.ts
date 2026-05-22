type Flags = {
  enableCheckout: boolean;
  retryCount: number;
  region: 'us' | 'eu';
};

const defaults = {
  enableCheckout: false,
  retryCount: 2,
  region: 'us'
};

export function mergeConfig(overrides: Partial<Flags>) {
  return { ...defaults, ...overrides };
}

const cfg = mergeConfig(JSON.parse(process.env.APP_FLAGS || '{}'));

if (cfg.region === 'apac') {
  console.log('APAC beta');
}

export function getFlag<K extends keyof Flags>(key: K) {
  return cfg[key];
}