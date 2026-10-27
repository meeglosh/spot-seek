const mockInit = jest.fn();
jest.mock('@sentry/react-native', () => ({ init: (o: unknown) => mockInit(o), setUser: jest.fn() }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0', ios: { buildNumber: '46' } } } }));
const device = { isDevice: true };
jest.mock('expo-device', () => ({ get isDevice() { return device.isDevice; } }));

async function load(opts: { isDevice: boolean; dev: boolean; override?: boolean }) {
  device.isDevice = opts.isDevice;
  (globalThis as { __DEV__?: boolean }).__DEV__ = opts.dev;
  if (opts.override) process.env.EXPO_PUBLIC_SENTRY_DEV = '1';
  else delete process.env.EXPO_PUBLIC_SENTRY_DEV;
  mockInit.mockClear();
  jest.resetModules();
  const mod = jest.requireActual<typeof import('../lib/sentry')>('../lib/sentry');
  mod.initSentry();
  return mod;
}

afterEach(() => {
  delete process.env.EXPO_PUBLIC_SENTRY_DEV;
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
});

describe('sentry enablement', () => {
  it('device + release: enabled, testflight', async () => {
    const m = await load({ isDevice: true, dev: false });
    expect(m.sentryEnabled).toBe(true);
    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit.mock.calls[0][0]).toMatchObject({ enabled: true, environment: 'testflight' });
  });
  it('simulator + release: disabled, init never called', async () => {
    const m = await load({ isDevice: false, dev: false });
    expect(m.sentryEnabled).toBe(false);
    expect(mockInit).not.toHaveBeenCalled();
  });
  it('simulator + release + EXPO_PUBLIC_SENTRY_DEV=1: enabled, simulator', async () => {
    const m = await load({ isDevice: false, dev: false, override: true });
    expect(m.sentryEnabled).toBe(true);
    expect(mockInit.mock.calls[0][0]).toMatchObject({ enabled: true, environment: 'simulator' });
  });
  it('dev on device: disabled', async () => {
    const m = await load({ isDevice: true, dev: true });
    expect(m.sentryEnabled).toBe(false);
    expect(mockInit).not.toHaveBeenCalled();
  });
  it('dev on simulator: disabled', async () => {
    expect((await load({ isDevice: false, dev: true })).sentryEnabled).toBe(false);
    expect(mockInit).not.toHaveBeenCalled();
  });
  it('dev on device + override: enabled, development', async () => {
    await load({ isDevice: true, dev: true, override: true });
    expect(mockInit.mock.calls[0][0]).toMatchObject({ environment: 'development' });
  });
});
